#!/usr/bin/env node
// Verify that every JavaScript file in dist/ parses as ES2017 and print sizes.
import { parse } from 'acorn'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dir = 'dist'
const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile())
let failed = false

for (const file of files.filter((f) => /\.(c?js)$/.test(f))) {
  const code = readFileSync(join(dir, file), 'utf8')
  try {
    parse(code, { ecmaVersion: 2017, sourceType: file.endsWith('.cjs') ? 'script' : 'module' })
  } catch (error) {
    failed = true
    console.error(`[check-dist] ${file} is not valid ES2017: ${error.message}`)
  }
}

for (const required of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
  if (!files.includes(required)) {
    failed = true
    console.error(`[check-dist] missing dist/${required}`)
  }
}

console.log('[check-dist] file                 raw      gzip')
for (const file of files.sort()) {
  const buf = readFileSync(join(dir, file))
  console.log(`[check-dist] ${file.padEnd(20)} ${String(buf.length).padStart(6)}  ${String(gzipSync(buf).length).padStart(6)}`)
}

if (failed) process.exit(1)
console.log('[check-dist] ok: all JavaScript output parses as ES2017')
