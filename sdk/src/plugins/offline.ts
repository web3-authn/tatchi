import * as fs from 'node:fs'
import * as path from 'node:path'
import { applyCoepCorpIfNeeded, resolveCoepMode, setContentType } from './plugin-utils'

// Offline export route HTML: fully externalized (no inline) so strict CSP works.
export function buildOfflineExportHtml(sdkBasePath: string): string {
  const rpIdBase = (process?.env?.VITE_RP_ID_BASE || '').toString().trim();
  const rpIdMeta = rpIdBase ? `\n    <meta name="tatchi-rpid-base" content="${rpIdBase}">` : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Emergency Export (Offline)</title>
    <link rel="manifest" href="/offline-export/manifest.webmanifest">${rpIdMeta}
    <link rel="stylesheet" href="${sdkBasePath}/wallet-service.css">
    <link rel="stylesheet" href="${sdkBasePath}/w3a-components.css">
    <link rel="stylesheet" href="${sdkBasePath}/drawer.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-tree.css">
    <link rel="stylesheet" href="${sdkBasePath}/tx-confirmer.css">
    <link rel="stylesheet" href="${sdkBasePath}/offline-export.css">
    <script src="${sdkBasePath}/wallet-shims.js"></script>
    <link rel="modulepreload" href="/offline-export/offline-export-app.js" crossorigin>
  </head>
  <body>
    <script type="module" src="/offline-export/offline-export-app.js" crossorigin></script>
  </body>
  </html>`
}

// Build a curated list of assets to precache for the offline-export route.
// - Includes the route HTML + manifest
// - Includes the SDK CSS/JS used by the route
// - Includes worker JS + WASM
// - Also scans offline-export-app.js for direct ESM imports (hashed files) in the SDK dist
export function computeOfflinePrecacheList(sdkBasePath: string, sdkDistRoot: string): string[] {
  const list: string[] = []
  const add = (p?: string) => {
    if (!p) return
    if (!list.includes(p)) list.push(p)
  }
  // Route assets
  add('/offline-export/index.html')
  add('/offline-export/manifest.webmanifest')
  // Offline-scoped app entry so SW-controlled loads work on offline refresh
  add('/offline-export/offline-export-app.js')
  // SDK surface/css/js
  add(`${sdkBasePath}/wallet-service.css`)
  add(`${sdkBasePath}/w3a-components.css`)
  add(`${sdkBasePath}/drawer.css`)
  add(`${sdkBasePath}/tx-tree.css`)
  add(`${sdkBasePath}/tx-confirmer.css`)
  add(`${sdkBasePath}/offline-export.css`)
  // Export viewer CSS used by offline export drawer flow
  add(`${sdkBasePath}/export-viewer.css`)
  add(`${sdkBasePath}/export-iframe.css`)
  add(`${sdkBasePath}/wallet-shims.js`)
  add(`${sdkBasePath}/offline-export-app.js`)
  // Workers and WASM
  add(`${sdkBasePath}/workers/web3authn-signer.worker.js`)
  add(`${sdkBasePath}/workers/web3authn-vrf.worker.js`)
  add(`${sdkBasePath}/workers/wasm_signer_worker_bg.wasm`)
  add(`${sdkBasePath}/workers/wasm_vrf_worker_bg.wasm`)

  // Scan offline-export-app.js for sibling ESM imports and include them
  try {
    const entry = path.join(sdkDistRoot, 'esm', 'sdk', 'offline-export-app.js')
    if (fs.existsSync(entry)) {
      const src = fs.readFileSync(entry, 'utf-8')
      const re = /(?:import\(|from)\s*["']\.\/([^"']+\.js)["']/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const file = m[1]
        if (file && !file.includes('..')) add(`${sdkBasePath}/${file.replace(/^\.\//, '')}`)
      }
    }
  } catch {}

  // Include all JS chunks in esm/sdk (covers dynamic imports such as localOnly-*.js, transactions-*.js, etc.)
  try {
    const sdkDir = path.join(sdkDistRoot, 'esm', 'sdk')
    const files = fs.readdirSync(sdkDir, { withFileTypes: true })
    for (const f of files) {
      if (!f.isFile()) continue
      if (f.name.endsWith('.js')) add(`${sdkBasePath}/${f.name}`)
    }
  } catch {}

  return list
}


export function addOfflineExportDevRoutes(
  server: any,
  opts: {
    sdkDistRoot: string
    sdkBasePath: string
    offlineHtml: string
    includeAppModule?: boolean
    coepMode?: 'strict' | 'off'
  }
) {
  const { sdkDistRoot, sdkBasePath, offlineHtml, includeAppModule } = opts
  const coepMode = resolveCoepMode(opts.coepMode)

  // Route: /offline-export (HTML)
  server.middlewares.use((req: any, res: any, next: any) => {
    const url = (req.url || '').split('?')[0]
    if (url !== '/offline-export' && url !== '/offline-export/') return next()
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // HTML should never be cached; keeps SW updates and app changes visible
    res.setHeader('Cache-Control', 'no-cache')
    applyCoepCorpIfNeeded(res, coepMode)
    res.end(offlineHtml)
  })

  // Route: /offline-export/manifest.webmanifest
  server.middlewares.use((req: any, res: any, next: any) => {
    const url = (req.url || '').split('?')[0]
    if (url !== '/offline-export/manifest.webmanifest') return next()
    const manifest = {
      name: 'Emergency Export',
      short_name: 'Export',
      start_url: '/offline-export/',
      scope: '/offline-export/',
      display: 'standalone',
      background_color: '#0b0b0c',
      theme_color: '#0b0b0c',
      icons: [] as any[],
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    applyCoepCorpIfNeeded(res, coepMode)
    res.end(JSON.stringify(manifest))
  })

  // Route: /offline-export/sw.js
  server.middlewares.use((req: any, res: any, next: any) => {
    const url = (req.url || '').split('?')[0]
    if (url !== '/offline-export/sw.js') return next()
    try {
      const filePath = path.join(sdkDistRoot, 'workers', 'offline-export-sw.js')
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404
        res.end('offline-export-sw.js not found in SDK dist')
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      // Ensure SW updates are fetched fresh during dev
      res.setHeader('Cache-Control', 'no-cache')
      applyCoepCorpIfNeeded(res, coepMode)
      fs.createReadStream(filePath).pipe(res)
    } catch (e) {
      res.statusCode = 500
      res.end('failed to serve offline SW')
    }
  })

  // Route: /offline-export/workers/* (map to SDK dist workers)
  server.middlewares.use((req: any, res: any, next: any) => {
    const url = (req.url || '').split('?')[0]
    if (!url.startsWith('/offline-export/workers/')) return next()
    try {
      const rel = url.replace('/offline-export/workers/', '')
      const filePath = path.join(sdkDistRoot, 'workers', rel)
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404
        res.end('worker asset not found')
        return
      }
      res.statusCode = 200
      setContentType(res, filePath)
      applyCoepCorpIfNeeded(res, coepMode)
      fs.createReadStream(filePath).pipe(res)
    } catch (e) {
      res.statusCode = 500
      res.end('failed to serve offline-export worker asset')
    }
  })

  // Route: /offline-export/precache.manifest.json
  server.middlewares.use((req: any, res: any, next: any) => {
    const url = (req.url || '').split('?')[0]
    if (url !== '/offline-export/precache.manifest.json') return next()
    try {
      const entries = computeOfflinePrecacheList(sdkBasePath, sdkDistRoot)
      ;[
        '/offline-export/workers/web3authn-signer.worker.js',
        '/offline-export/workers/web3authn-vrf.worker.js',
        '/offline-export/workers/wasm_signer_worker_bg.wasm',
        '/offline-export/workers/wasm_vrf_worker_bg.wasm',
      ].forEach((p) => {
        if (!entries.includes(p)) entries.push(p)
      })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      applyCoepCorpIfNeeded(res, coepMode)
      res.end(JSON.stringify(entries))
    } catch (e) {
      res.statusCode = 500
      res.end('failed to build precache manifest')
    }
  })

  if (includeAppModule) {
    // Route: /offline-export/offline-export-app.js
    server.middlewares.use((req: any, res: any, next: any) => {
      const url = (req.url || '').split('?')[0]
      if (url !== '/offline-export/offline-export-app.js') return next()
      try {
        const filePath = path.join(sdkDistRoot, 'esm', 'sdk', 'offline-export-app.js')
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404
          res.end('offline-export-app.js not found in SDK dist')
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        applyCoepCorpIfNeeded(res, coepMode)
        fs.createReadStream(filePath).pipe(res)
      } catch (e) {
        res.statusCode = 500
        res.end('failed to serve offline-export-app.js')
      }
    })

    // Route: offline-export sibling ESM chunks
    server.middlewares.use((req: any, res: any, next: any) => {
      const url = (req.url || '').split('?')[0]
      const isChunk = url.startsWith('/offline-export/') && url.endsWith('.js') && !url.startsWith('/offline-export/workers/')
      if (!isChunk) return next()
      try {
        const filename = url.replace('/offline-export/', '')
        const filePath = path.join(sdkDistRoot, 'esm', 'sdk', filename)
        if (!fs.existsSync(filePath)) return next()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        applyCoepCorpIfNeeded(res, coepMode)
        fs.createReadStream(filePath).pipe(res)
      } catch {
        next()
      }
    })
  }
}

// ===== Build-time helpers =====

function ensureDir(p: string): void {
  try { fs.mkdirSync(p, { recursive: true }) } catch {}
}

function writeTextIfMissing(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) return
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, content, 'utf-8')
}

function writeJsonIfMissing(filePath: string, obj: unknown): void {
  if (fs.existsSync(filePath)) return
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8')
}

function copyIfExists(src: string, dst: string): boolean {
  if (!fs.existsSync(src)) return false
  ensureDir(path.dirname(dst))
  fs.copyFileSync(src, dst)
  return true
}

function copyBatchIfExists(srcDir: string, files: string[], dstDir: string): void {
  ensureDir(dstDir)
  for (const f of files) {
    const src = path.join(srcDir, f)
    const dst = path.join(dstDir, f)
    if (fs.existsSync(src)) fs.copyFileSync(src, dst)
  }
}

export function emitOfflineExportAssets(opts: { outDir: string; sdkBasePath: string; sdkDistRoot: string }): void {
  const { outDir, sdkBasePath, sdkDistRoot } = opts
  const offlineDir = path.join(outDir, 'offline-export')
  const workersDir = path.join(offlineDir, 'workers')

  let swCopied = false
  let workersCopied = false
  let appCopied = false
  let htmlEnsured = false
  let manifestEnsured = false
  let precacheEmitted = false

  // 1) Copy Service Worker
  try {
    const swSrc = path.join(sdkDistRoot, 'workers', 'offline-export-sw.js')
    const swDst = path.join(offlineDir, 'sw.js')
    swCopied = copyIfExists(swSrc, swDst)
    if (!swCopied) console.warn('[tatchi][offline] SW not found in SDK dist; skipping copy')
  } catch (e) {
    console.warn('[tatchi][offline] failed to copy SW:', e)
  }

  // 2) Copy workers + WASM
  try {
    const srcDir = path.join(sdkDistRoot, 'workers')
    copyBatchIfExists(srcDir, [
      'web3authn-signer.worker.js',
      'web3authn-vrf.worker.js',
      'wasm_signer_worker_bg.wasm',
      'wasm_vrf_worker_bg.wasm',
    ], workersDir)
    workersCopied = true
  } catch (e) {
    console.warn('[tatchi][offline] failed to copy workers:', e)
  }

  // 3) Copy offline-export app module
  try {
    const src = path.join(sdkDistRoot, 'esm', 'sdk', 'offline-export-app.js')
    const dst = path.join(offlineDir, 'offline-export-app.js')
    appCopied = copyIfExists(src, dst)
    if (!appCopied) console.warn('[tatchi][offline] app module not found in SDK dist; skipping copy')
  } catch (e) {
    console.warn('[tatchi][offline] failed to copy app module:', e)
  }

  // 4) Emit HTML + manifest if missing
  try {
    const offHtml = path.join(offlineDir, 'index.html')
    writeTextIfMissing(offHtml, buildOfflineExportHtml(sdkBasePath))
    htmlEnsured = fs.existsSync(offHtml)
  } catch (e) {
    console.warn('[tatchi][offline] failed to emit index.html:', e)
  }
  try {
    const manifestPath = path.join(offlineDir, 'manifest.webmanifest')
    writeJsonIfMissing(manifestPath, {
      name: 'Emergency Export',
      short_name: 'Export',
      start_url: '/offline-export/',
      scope: '/offline-export/',
      display: 'standalone',
      background_color: '#0b0b0c',
      theme_color: '#0b0b0c',
      icons: [] as any[],
    })
    manifestEnsured = fs.existsSync(manifestPath)
  } catch (e) {
    console.warn('[tatchi][offline] failed to emit manifest.webmanifest:', e)
  }

  // 5) Emit precache manifest
  try {
    const precachePath = path.join(offlineDir, 'precache.manifest.json');
    const entries = computeOfflinePrecacheList(sdkBasePath, sdkDistRoot);
    ;[
      '/offline-export/offline-export-app.js',
      '/offline-export/workers/web3authn-signer.worker.js',
      '/offline-export/workers/web3authn-vrf.worker.js',
      '/offline-export/workers/wasm_signer_worker_bg.wasm',
      '/offline-export/workers/wasm_vrf_worker_bg.wasm',
    ].forEach((p) => { if (!entries.includes(p)) entries.push(p) });
    ensureDir(offlineDir)
    fs.writeFileSync(precachePath, JSON.stringify(entries, null, 2), 'utf-8');
    precacheEmitted = true
  } catch (e) {
    console.warn('[tatchi][offline] failed to emit precache.manifest.json:', e)
  }

  // Consolidated summary
  console.log(
    `[tatchi][offline] emitted assets: sw=${swCopied ? 'ok' : 'skip'} workers=${workersCopied ? 'ok' : 'skip'} app=${appCopied ? 'ok' : 'skip'} html=${htmlEnsured ? 'ok' : 'skip'} manifest=${manifestEnsured ? 'ok' : 'skip'} precache=${precacheEmitted ? 'ok' : 'skip'}`
  )
}

// Re-export helpers so Offline surface stays co-located
export { }

export type { }
