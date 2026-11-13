// Packs the library and checks that the tarball works in two minimal consumer projects:
//   1. Vite 5 + @vitejs/plugin-legacy 5.4.1, type-checked with TypeScript 5.2
//   2. Nuxt 3.11, built and rendered on the server (import and start() must not throw during SSR)
// Then prints a size report. Needs network access for npm installs.
//
// Usage: node scripts/verify-consumers.mjs [--keep]
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('..', import.meta.url))
const keep = process.argv.includes('--keep')
const work = mkdtempSync(join(tmpdir(), 'tab-leader-consumers-'))

function run(command, args, cwd) {
  console.log(
    `[verify] (${cwd === root ? 'repo' : cwd.slice(work.length + 1) || 'work'}) ${command} ${args.join(' ')}`,
  )
  return execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
}

function write(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n')
  }
}

const npmInstall = (dir, ...extra) =>
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...extra], dir)

// ---------- pack ----------
run('pnpm', ['build'], root)
const packed = run('pnpm', ['pack', '--pack-destination', work], root)
const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'))
if (!tgz) throw new Error('pnpm pack produced no tarball:\n' + packed)
const tarball = join(work, tgz)
const results = []

// ---------- 1. Vite 5 + plugin-legacy + TypeScript 5.2 ----------
const vite = join(work, 'vite-legacy')
write(vite, {
  'package.json': {
    name: 'consumer-vite-legacy',
    private: true,
    type: 'module',
    dependencies: { 'tab-leader': `file:${tarball}` },
    devDependencies: {
      vite: '5.4.21',
      '@vitejs/plugin-legacy': '5.4.1',
      terser: '^5.4.0',
      typescript: '5.2.2',
    },
  },
  'tsconfig.json': {
    compilerOptions: {
      target: 'ES2017',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2017', 'DOM'],
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
    },
    include: ['src'],
  },
  'vite.config.js': `import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [legacy({ targets: ['chrome >= 80', 'edge >= 80', 'firefox >= 74', 'safari >= 13.1', 'ios >= 12.4'] })],
})
`,
  'index.html': `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`,
  'src/main.ts': `import { createTabInterval, createTabLeader, type TabLeader, type TabLeaderMode } from 'tab-leader'

const leader: TabLeader = createTabLeader({
  name: 'consumer-vite',
  onLeader: () => render(),
  onFollower: () => render(),
})
const ticker = createTabInterval({ name: 'consumer-vite:interval', interval: 60_000, run: () => fetch('/ping') })

function render(): void {
  const mode: TabLeaderMode = leader.mode
  document.getElementById('app')!.textContent = (leader.isLeader ? 'leader' : 'follower') + ' / ' + mode
}

leader.start()
ticker.start()
render()
`,
})
npmInstall(vite)
run('npx', ['tsc', '-p', '.'], vite)
run('npx', ['vite', 'build'], vite)
const viteAssets = readdirSync(join(vite, 'dist/assets'))
const legacyChunk = viteAssets.find((f) => /^index-legacy-.*\.js$/.test(f))
if (!legacyChunk) throw new Error('No legacy chunk in Vite output: ' + viteAssets.join(', '))
if (!readFileSync(join(vite, 'dist/assets', legacyChunk), 'utf8').includes('consumer-vite')) {
  throw new Error('Legacy chunk does not contain the consumer code')
}
results.push(`Vite 5.4.21 + plugin-legacy 5.4.1: tsc 5.2.2 ok, build ok (legacy chunk ${legacyChunk})`)

// ---------- 2. Nuxt 3.11 with SSR ----------
const nuxt = join(work, 'nuxt')
write(nuxt, {
  'package.json': {
    name: 'consumer-nuxt',
    private: true,
    type: 'module',
    dependencies: { nuxt: '3.11.2', 'tab-leader': `file:${tarball}` },
  },
  'nuxt.config.ts': `export default defineNuxtConfig({
  ssr: true,
  telemetry: false,
  devtools: { enabled: false },
  compatibilityDate: '2024-04-03',
})
`,
  'app.vue': `<script setup lang="ts">
import { createTabLeader } from 'tab-leader'

const leader = createTabLeader({ name: 'consumer-nuxt' })
// On the server start() must be a no-op: no window, no timers, no throw.
if (import.meta.server) leader.start()
const serverMode = leader.mode
const role = ref('pending')
onMounted(() => {
  leader.start()
  role.value = leader.mode
})
onBeforeUnmount(() => leader.destroy())
</script>

<template>
  <main>ssr-mode:{{ serverMode }} client:{{ role }}</main>
</template>
`,
})
// Resolve the dependency tree as of Nuxt 3.11's time: a fresh install pulls newer transitive packages
// (nitropack, vue, ...) that break even an empty Nuxt 3.11 app. Real projects pin these with a lockfile.
npmInstall(nuxt, '--before=2024-05-01')
run('npx', ['nuxi', 'build'], nuxt)
const port = 4791
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: nuxt,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NITRO_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
try {
  let html = ''
  for (let i = 0; i < 50 && !html; i++) {
    await new Promise((r) => setTimeout(r, 200))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`)
      if (res.status !== 200)
        throw new Error(
          `SSR responded ${res.status}: ${(await res.text()).slice(0, 300)}\n${serverLog.slice(0, 1500)}`,
        )
      html = await res.text()
    } catch (error) {
      if (i === 49) throw error
    }
  }
  if (!html.includes('ssr-mode:none'))
    throw new Error('SSR output missing "ssr-mode:none":\n' + html.slice(0, 500))
  if (/\berror\b/i.test(serverLog)) throw new Error('Nuxt server logged an error:\n' + serverLog)
  results.push('Nuxt 3.11.2: build ok, SSR render ok (mode "none" on the server, no errors)')
} finally {
  server.kill()
}

// ---------- size report ----------
const sizes = []
const kb = (n) => (n / 1024).toFixed(2) + ' KB'
sizes.push(`tarball ${tgz}: ${kb(statSync(tarball).size)}`)
for (const file of readdirSync(join(root, 'dist')).sort()) {
  const buf = readFileSync(join(root, 'dist', file))
  sizes.push(`dist/${file}: ${kb(buf.length)} raw, ${kb(gzipSync(buf).length)} gzip`)
}
const minDir = join(work, 'min')
const { build } = await import('tsdown')
await build({
  cwd: root,
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'browser',
  target: 'es2017',
  minify: true,
  dts: false,
  outDir: minDir,
  logLevel: 'silent',
})
const minFile = readdirSync(minDir).find((f) => f.endsWith('.js') || f.endsWith('.mjs'))
const min = readFileSync(join(minDir, minFile))
sizes.push(`both layers, minified ESM: ${kb(min.length)} raw, ${kb(gzipSync(min).length)} gzip`)

console.log('\n[verify] consumers')
for (const line of results) console.log('  ✓ ' + line)
console.log('[verify] sizes')
for (const line of sizes) console.log('  ' + line)
if (keep) console.log(`[verify] kept ${work}`)
else rmSync(work, { recursive: true, force: true })
