# Offline Export (PWA) — Service Worker and Integration

## Purpose

- Provide an offline‑first emergency export route at `/offline-export/` that can decrypt and display a user's private key locally, even with no network.
- Keep the rest of the wallet app fast and unaffected (no global SW).

## Key Modules

- Route app: `offline-export-app.ts`
  - Minimal page logic served at `/offline-export/`.
  - Registers the SW for this scope, warms assets (non‑blocking), configures worker URLs to the offline‑scoped copies, and starts the export UI.
- Service worker: `offline-export-sw.ts`
  - Cache‑only policy, scoped strictly to `/offline-export/`.
  - Versioned cache: `OFFLINE_EXPORT::<version>` (current default: v6).
  - Stable precache + manifest merge (`/offline-export/precache.manifest.json`).
  - Fallbacks for offline-scoped chunks via `/sdk/<basename>` and worker assets.
  - Explicit 504 on cache miss to surface dev/staging gaps quickly.

## Wallet Iframe Flow

1) Router (parent app, same origin as app) — `sdk/src/core/WalletIframe/client/router.ts`
   - When the online export UI (rendered inside the wallet iframe) fails to import a chunk or the browser is offline, the wallet host posts `{ type: 'OFFLINE_EXPORT_FALLBACK' }` to the parent window.
   - The router listens for that (`attachExportUiFallbackListener`) and opens offline export (`openOfflineExport`) in a new browser tab to `/offline-export/` on the wallet origin.
   - Messaging protocol: no handshake required for the new‑tab route. The offline app only posts `OFFLINE_EXPORT_ERROR` on failure; the wallet host posts `WALLET_UI_CLOSED` when the online viewer (in the wallet iframe) closes.

2) Wallet iframe host (wallet origin, inside the service iframe) — `sdk/src/core/WalletIframe/host/bootstrap.ts`
   - Calls `scheduleOfflineExportSwPriming()` after the host bootstraps. This schedules a background registration of the SW under `/offline-export/` (using `requestIdleCallback` or a short timeout), when `navigator.onLine` is true and only if not already registered.
   - Priming is fire‑and‑forget; it must never block wallet UI.

## Service Worker (`offline-export-sw.ts`)

- Scope: `/offline-export/` only. Register at `/offline-export/sw.js` with `{ scope: '/offline-export/' }`.
- Strategy: cache‑only for scope + selected `/sdk/*` assets.
  - Install: open versioned cache and precache stable URLs, then merge any entries listed in `/offline-export/precache.manifest.json` (if present).
  - Fetch: serve from cache (ignore search). Provide fallbacks:
    - If `/offline-export/offline-export-app.js` missing, serve `/sdk/offline-export-app.js`.
    - If `/offline-export/workers/<asset>` missing, serve `/sdk/workers/<asset>`.
    - For other offline‑scoped `.js/.css`, try basename under `/sdk/`, then any cached `/sdk/<prefix>-*.js` (prefix extracted from name before the first `-`).
    - For direct `/sdk/*` chunk requests: when online, network‑once warm and cache; when offline, use the same prefix fallback to cover hash churn.
  - Misses: return 504 “Offline asset not pre‑cached” (explicit by design).
- Versioning: bump `VERSION` to force fresh caches after releases.

## Route App (`offline-export-app.ts`)

- Registers the SW under `/offline-export/` and awaits `navigator.serviceWorker.ready`.
- Warms a curated list of CSS/JS/workers/WASM (fire‑and‑forget) when online so the next offline visit has everything in cache.
- Sets `window.__W3A_SIGNER_WORKER_URL__` and `window.__W3A_VRF_WORKER_URL__` to the offline‑scoped worker copies so their WASM fetches stay inside the SW scope.
- Provides a minimal shell with an “Export My Key” button and optional account selector.
- Posts `OFFLINE_EXPORT_READY` to the parent overlay controller, then waits for `OFFLINE_EXPORT_START` to begin the export flow for a specific account.

## Dev/Build Plugin Integration

- Dev routes (Vite): `sdk/src/plugins/offline.ts`
  - `addOfflineExportDevRoutes()` mounts:
    - `/offline-export/` HTML (strict CSP‑compatible, no inline)
    - `/offline-export/manifest.webmanifest`
    - `/offline-export/sw.js` (from SDK dist/workers)
    - `/offline-export/precache.manifest.json` (computed by scanning SDK dist)
    - Optional: `/offline-export/offline-export-app.js` + sibling ESM chunks
  - Headers: `Cache-Control: no-cache` for HTML/manifest/SW/precache/app JS to reduce dev staleness.
  - WASM MIME enforced.
- Build (Vite): `sdk/src/plugins/vite.ts` (inside `tatchiBuildHeaders` step)
  - Copies to output:
    - `/offline-export/sw.js` (from SDK `dist/workers/offline-export-sw.js`)
    - `/offline-export/workers/*` worker JS + WASM
    - `/offline-export/offline-export-app.js`
  - Emits (if not provided by app):
    - `/offline-export/index.html` (links only external CSS/JS, strict CSP‑friendly)
    - `/offline-export/manifest.webmanifest`
    - `/offline-export/precache.manifest.json` (via `computeOfflinePrecacheList()` which scans `dist/esm/sdk` and includes necessary `/sdk/*` chunks)
  - Also emits `/wallet-service/index.html` and `/export-viewer/index.html` when missing.

## Minimal Operational Checklist

- First visit while online: `/offline-export/` to allow SW install + precache.
- Toggle offline and reload `/offline-export/`: page renders with no network; no 504s.
- In normal flows, the router falls back to opening a new tab automatically when the online export UI cannot load a dependency offline.

## Troubleshooting

- 504 “Offline asset not pre‑cached”
  - Ensure SDK dist was built (`pnpm -C sdk build`) so `/sdk/<chunk>.js` exists.
  - Check `/offline-export/precache.manifest.json` for missing entries; the dev route computes this list on the fly.
  - Bump SW `VERSION` in `offline-export-sw.ts` (or inject at build) to evict stale caches.
  - Unregister the SW and re‑visit `/offline-export/` while online once to prime.
