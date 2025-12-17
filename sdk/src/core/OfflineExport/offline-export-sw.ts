/**
 * Offline Export Service Worker (scoped to /offline-export/)
 *
 * Purpose
 * - Provide an offline-first route that can unlock and export keys locally
 *   even when the network is unavailable. See docs/offline-export.md.
 *
 * Scope and strategy
 * - Service Worker scope: `/offline-export/` only. It must be registered at
 *   `/offline-export/sw.js` with `{ scope: '/offline-export/' }`.
 * - Cache-only for all requests under scope. No network fetches for assets
 *   or data under this path. If an asset is missing from the cache, respond
 *   with 504 to make failures explicit rather than silently fetching online.
 * - Precache a minimal, stable set of files plus an optional precache
 *   manifest. The manifest, when present, should list all emitted runtime
 *   assets (JS/CSS/workers/WASM/icons).
 *
 * Build-time integration
 * - This file is bundled and shipped with the SDK. Hosts should copy the
 *   compiled JS to `/offline-export/sw.js` at deploy time.
 * - Optionally, generate and publish `/offline-export/precache.manifest.json`
 *   during app builds and include it in the initial precache list below.
 * - Headers recommended (see docs):
 *   - `/offline-export/sw.js`: `Cache-Control: no-cache`
 *   - `/offline-export/index.html`: `Cache-Control: no-cache`
 *   - Other `/offline-export/*`: `Cache-Control: public, max-age=31536000, immutable`
 *
 * Notes on TypeScript
 * - We intentionally avoid relying on TS's `dom.serviceworker` lib so the
 *   SDK's base tsconfig doesn't need to include it. Use `any` for SW events.
 */

// Versioned cache. Bump to evict old assets after releases.
const VERSION = 'OFFLINE_EXPORT_v6'
const CACHE_NAME = `OFFLINE_EXPORT::${VERSION}`

// Resolve scope path from registration scope when available, fallback to
// canonical `/offline-export/`.
const SCOPE_PATH: string = (() => {
  const scope = (self as any).registration?.scope as string | undefined
  if (scope) {
    const p = new URL(scope).pathname
    return p.endsWith('/') ? p : p + '/'
  }
  return '/offline-export/'
})()

// Minimal, stable files to precache. Hosts should also generate a manifest
// (JSON array of paths) at `/offline-export/precache.manifest.json` listing
// all fingerprinted assets (chunks, workers, wasm, icons).
const STABLE_PRECACHE: string[] = [
  `${SCOPE_PATH}`,
  `${SCOPE_PATH}index.html`,
  `${SCOPE_PATH}manifest.webmanifest`,
  `${SCOPE_PATH}precache.manifest.json`,
  // Offline app entry must be available on offline refresh
  `${SCOPE_PATH}offline-export-app.js`,
  // Offline-scoped worker copies so the SW controls their subresource fetches (WASM)
  `${SCOPE_PATH}workers/web3authn-signer.worker.js`,
  `${SCOPE_PATH}workers/web3authn-vrf.worker.js`,
  `${SCOPE_PATH}workers/wasm_signer_worker_bg.wasm`,
  `${SCOPE_PATH}workers/wasm_vrf_worker_bg.wasm`,
  // SDK assets required by the offline page (served from cache-only while controlled)
  `/sdk/wallet-service.css`,
  `/sdk/w3a-components.css`,
  `/sdk/drawer.css`,
  `/sdk/tx-tree.css`,
  `/sdk/tx-confirmer.css`,
  // Export viewer CSS used by the drawer flow
  `/sdk/export-viewer.css`,
  `/sdk/export-iframe.css`,
  `/sdk/wallet-shims.js`,
  `/sdk/offline-export-app.js`,
  // Export viewer support scripts used by the drawer flow
  `/sdk/export-private-key-viewer.js`,
  `/sdk/iframe-export-bootstrap.js`,
  // Workers and WASM needed for offline export flow
  `/sdk/workers/web3authn-signer.worker.js`,
  `/sdk/workers/web3authn-vrf.worker.js`,
  `/sdk/workers/wasm_signer_worker_bg.wasm`,
  `/sdk/workers/wasm_vrf_worker_bg.wasm`,
]

async function precacheAll(cache: Cache): Promise<void> {
  // Force revalidation/bypass of the HTTP cache so SW bumps actually pull fresh worker/WASM bytes.
  const cacheAdd = async (url: string): Promise<void> => {
    try { await cache.add(new Request(url, { cache: 'reload' })); return; } catch {}
    try { await cache.add(url); } catch {}
  };
  // Put stable files first (best-effort per‑item to avoid all‑or‑nothing failures)
  for (const url of STABLE_PRECACHE) {
    await cacheAdd(url)
  }

  // Merge manifest entries when present (manifest itself must be precached)
  try {
    const res = await cache.match(`${SCOPE_PATH}precache.manifest.json`, { ignoreSearch: true })
    if (res && res.ok) {
      const list = (await res.clone().json()) as unknown
      if (Array.isArray(list)) {
        const urls = list
          .filter((x) => typeof x === 'string' && (x.startsWith(SCOPE_PATH) || x.startsWith('/sdk/')))
          .map((x) => x as string)
        if (urls.length) {
          // Best-effort: cache additional assets; ignore individual failures
          await Promise.allSettled(urls.map((u) => cacheAdd(u)))
        }
      }
    }
  } catch {}
}

// Install: precache and activate immediately (isolated scope)
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await precacheAll(cache)
      // Immediate activation helps during maintenance windows
      ;(self as any).skipWaiting?.()
    })()
  )
})

// Activate: remove old caches and claim clients
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('OFFLINE_EXPORT::') && k !== CACHE_NAME).map((k) => caches.delete(k)))
      ;(self as any).clients?.claim?.()
    })()
  )
})

// Fetch: serve from cache for any request under scope. Never hit network.
self.addEventListener('fetch', (event: any) => {
  const req: Request = event.request
  // Only handle GET requests within our scope
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Intercept requests for the offline-export scope and the specific SDK assets
  const isOfflineScope = url.pathname.startsWith(SCOPE_PATH)
  const isSdkAsset = url.pathname.startsWith('/sdk/')
  if (!isOfflineScope && !isSdkAsset) return

  // Serve cached response; ignore search params to keep lookups stable
  event.respondWith(
    (async () => {
      const match = await caches.match(req, { ignoreSearch: true })
      if (match) return match
      // Fallback: if offline app script isn't cached under scope, try SDK path
      if (isOfflineScope && url.pathname === `${SCOPE_PATH}offline-export-app.js`) {
        const alt = await caches.match(`/sdk/offline-export-app.js`, { ignoreSearch: true })
        if (alt) return alt
      }
      // Fallback: if offline-scoped worker asset isn't cached, try SDK worker path
      if (isOfflineScope && url.pathname.startsWith(`${SCOPE_PATH}workers/`)) {
        const rest = url.pathname.slice((`${SCOPE_PATH}workers/`).length)
        const altUrl = `/sdk/workers/${rest}`
        const alt = await caches.match(altUrl, { ignoreSearch: true })
        if (alt) return alt
      }
      // Fallback: for other offline-scoped JS/CSS assets, try the SDK base filename
      if (isOfflineScope && !url.pathname.startsWith(`${SCOPE_PATH}workers/`)) {
        const isStaticAsset = /\.(?:js|css)(?:$|\?)/.test(url.pathname)
        if (isStaticAsset) {
          const base = url.pathname.split('/').pop() || ''
          if (base) {
            // First try exact basename under /sdk
            const alt = await caches.match(`/sdk/${base}`, { ignoreSearch: true })
            if (alt) return alt
          }
        }
      }
      // For SDK assets, prefer network-once to warm the cache during first online load.
      // When offline and the hashed chunk is missing, fail explicitly rather than
      // serving a different cached chunk (mixing builds can cause ESM export errors).
      if (isSdkAsset) {
        try {
          const res = await fetch(req)
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME)
            await cache.put(req, res.clone())
            return res
          }
        } catch {
        }
      }
      // Missing asset: explicit failure (no network/fallback)
      return new Response('Not cached', { status: 504, statusText: 'Offline asset not pre-cached' })
    })()
  )
})

// Messages: allow simple diagnostics from pages
self.addEventListener('message', (event: any) => {
  const data = event?.data
  if (!data || typeof data !== 'object') return
  const type = (data as any).type || ''
  switch (type) {
    case 'OFFLINE_EXPORT_PING':
      event.source?.postMessage?.({ type: 'OFFLINE_EXPORT_PONG', version: VERSION, scope: SCOPE_PATH, cacheName: CACHE_NAME })
      break
    // Best-effort: re-run precache when requested by an out-of-scope page (e.g., wallet iframe host boot).
    // This makes offline export self-healing across deployments and stale HTTP caches.
    case 'OFFLINE_EXPORT_PRIME': {
      event.waitUntil(
        (async () => {
          try {
            const cache = await caches.open(CACHE_NAME)
            await precacheAll(cache)
            event.source?.postMessage?.({ type: 'OFFLINE_EXPORT_PRIMED', ok: true, version: VERSION })
          } catch (e: any) {
            event.source?.postMessage?.({
              type: 'OFFLINE_EXPORT_PRIMED',
              ok: false,
              version: VERSION,
              error: String(e?.message || e || 'failed'),
            })
          }
        })()
      )
      break
    }
    // Deprecated: version query no longer needed; version format is stable.
    default:
      break
  }
})

export {}
