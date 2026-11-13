// Minimal static server for the demo page and browser tests. Serves only /demo and /dist.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT) || 4789
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
  if (pathname === '/' || pathname === '/demo') {
    res.writeHead(302, { location: '/demo/' })
    return res.end()
  }
  const relative = normalize(pathname.endsWith('/') ? pathname + 'index.html' : pathname).replace(
    /^[/\\]+/,
    '',
  )
  const allowed = relative.startsWith('demo' + sep) || relative.startsWith('dist' + sep)
  if (!allowed || relative.split(sep).includes('..')) {
    res.writeHead(404)
    return res.end('Not found')
  }
  try {
    const body = await readFile(join(root, relative))
    res.writeHead(200, {
      'content-type': types[extname(relative)] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`tab-leader demo: http://127.0.0.1:${port}/demo/`)
})
