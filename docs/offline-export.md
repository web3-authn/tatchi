# Offline Export (PWA) — Final Design (with lessons learned)

This document describes how the offline export route under `/offline-export/` is implemented.

**Goals**
- Keep initial app and wallet SDK load fast: never block first paint or SDK bootstrap.
- Preserve WebAuthn security: rpId bound to the wallet origin; no alternate origins.
- Work truly offline: cache‑only Service Worker (SW) scoped to `/offline-export/`.
- Be resilient to hashed ESM chunks and build changes.
- Require user verification before decrypting and showing the private key.

**Principles**
- Non‑blocking everywhere: SW priming and prewarm are fire‑and‑forget.
- Isolated scope: SW controls only `/offline-export/`; the rest of the app remains unaffected.
- Dual path: wallet host UI when online; offline overlay fallback when needed.
- Single source of truth: one curated asset list shared between precache and warmup.

**Architecture**
- Route `/offline-export/`: minimal HTML + `offline-export-app.js` + `manifest.webmanifest`.
- Service Worker: `sdk/src/core/OfflineExport/offline-export-sw.ts`
  - Cache‑only inside scope; versioned cache `OFFLINE_EXPORT::<version>` (current: v4).
  - Stable precache (HTML/manifest/offline app/workers/WASM + SDK CSS/JS used by the flow).
  - Merge `/offline-export/precache.manifest.json` to collect all emitted ESM.
  - Fallbacks for dynamic chunks: if `/offline-export/<prefix>-<hash>.js` is missing, serve cached `/sdk/<prefix>-<hash>.js` or any `/sdk/<prefix>-*.js`.
  - 504 on cache miss (no network) to surface gaps instantly during development.
- Wallet host (online path): renders export UI in‑iframe. If the host cannot import a dynamic chunk while offline, it posts `OFFLINE_EXPORT_FALLBACK`; the parent switches to `/offline-export/` overlay.
- Offline overlay: full‑screen iframe of `/offline-export/` controlled by the SW; the parent opens it via `openOfflineExport` and listens for `WALLET_UI_CLOSED` or `OFFLINE_EXPORT_ERROR`.

**Non‑Blocking SW Priming**
- Only the wallet host primes the SW — never the app origin.
- `sdk/src/core/OfflineExport/priming.ts`:
  - `scheduleOfflineExportSwPriming()` schedules `primeOfflineExportSw()` via `requestIdleCallback` (or small `setTimeout`) and never awaits.
  - `primeOfflineExportSw()` checks `navigator.onLine` and skips if a registration already exists for `/offline-export/`.
- The offline app (`/offline-export/`) registers its own SW and awaits `ready()` — only on that route.

**Module Layout**
- `sdk/src/core/OfflineExport/priming.ts` — schedule + register SW (non‑blocking).
- `sdk/src/core/OfflineExport/offline-export-app.ts` — route entry: registers SW, warms assets (non‑blocking), sets worker URLs to offline scope, runs export flow.
- `sdk/src/core/OfflineExport/offline-export-sw.ts` — cache‑only SW with manifest merge and chunk fallbacks.
- `sdk/src/core/WalletIframe/client/router.ts` — implements `openOfflineExport`, message wiring, and fallback trigger (`OFFLINE_EXPORT_FALLBACK`).


**Precache + Warm Lists (single source of truth)**
- Build‑time: `computeOfflinePrecacheList()` (in `sdk/src/plugins/offline.ts`) curates entries:
  - All `dist/esm/sdk/*.js` chunks (covers `localOnly-*.js`, `tags-*.js`, `lit-events-*.js`, etc.).
  - Viewer CSS/JS: `wallet-service.css`, `w3a-components.css`, `drawer.css`, `tx-tree.css`, `tx-confirmer.css`, `export-viewer.css`, `export-iframe.css`, `wallet-shims.js`.
  - Offline app + workers under scope.
- Runtime: the offline app warms the same critical assets fire‑and‑forget while online.

**Dev + Build Integration**
- Dev
  - `sdk/src/plugins/offline.ts` defines `addOfflineExportDevRoutes()`. It is mounted by:
    - `tatchiServeSdk()` and `tatchiWalletService()` in `sdk/src/plugins/vite.ts`.
  - Served routes: `/offline-export/` HTML, `manifest.webmanifest`, `precache.manifest.json`, `sw.js`, `offline-export-app.js` (+ sibling ESM), and `/offline-export/workers/*` mapped from SDK dist.
  - Headers: `Cache-Control: no-cache` for HTML/manifest/SW/precache/app JS to avoid staleness; WASM MIME set; COEP/CORP applied.
- Build (Vite) — `sdk/src/plugins/vite.ts`:
  - Copy SW to `/offline-export/sw.js`.
  - Copy `/offline-export/workers/*` (JS + WASM).
  - Copy `offline-export-app.js` to `/offline-export/`.
  - Emit `/offline-export/index.html`, `/offline-export/manifest.webmanifest`, `/offline-export/precache.manifest.json` (via `computeOfflinePrecacheList()`).
  - HTML is produced by `buildOfflineExportHtml()` (strict‑CSP friendly, externalized assets).
  - Headers: `_headers` emission includes cache policy for offline export (no‑cache for HTML/SW; immutable for other assets).

- Build (Next.js) — `@tatchi-xyz/sdk/plugins/next`:
  - Use the postbuild helper to materialize offline export into your `public/` folder:
    ```ts
    // scripts/postbuild-offline.ts
    import { nextEmitOfflineExportAssets } from '@tatchi-xyz/sdk/plugins/next'
    nextEmitOfflineExportAssets({ outDir: './public', sdkBasePath: '/sdk' })
    ```
  - Then add to package.json:
    ```json
    { "scripts": { "postbuild": "node scripts/postbuild-offline.ts" } }
    ```
  - This copies the SW, workers/WASM, offline app JS, and emits HTML/manifest/precache.

**Service Worker Details**
- Stable precache includes:
  - `/offline-export/`, `/offline-export/index.html`, `/offline-export/manifest.webmanifest`, `/offline-export/precache.manifest.json`, `/offline-export/offline-export-app.js`.
  - `/offline-export/workers/*` and `/sdk/workers/*` (fallbacks).
  - CSS/JS: `/sdk/wallet-service.css`, `/sdk/w3a-components.css`, `/sdk/drawer.css`, `/sdk/tx-tree.css`, `/sdk/tx-confirmer.css`, `/sdk/export-viewer.css`, `/sdk/export-iframe.css`, `/sdk/wallet-shims.js`.
  - Viewer scripts: `/sdk/export-private-key-viewer.js`, `/sdk/iframe-export-bootstrap.js`.
- Fallbacks:
  - If `/offline-export/offline-export-app.js` not cached, try `/sdk/offline-export-app.js`.
  - If a scoped worker is missing, try `/sdk/workers/<name>`.
  - For offline‑scoped JS/CSS, try basename under `/sdk/`, then any `/sdk/<prefix>-*.js`.
  - For `/sdk/*` assets, use network‑once (when online) to warm in the background.
- Scope resolution:
  - SW derives `SCOPE_PATH` from `self.registration.scope`; register at `/offline-export/sw.js` with `{ scope: '/offline-export/' }`.

**Offline App (Route Entry)**
- Registers SW and awaits `ready()` only here.
- Warms critical assets (CSS/JS/workers/WASM) fire‑and‑forget.
- Sets `window.__W3A_SIGNER_WORKER_URL__` and `window.__W3A_VRF_WORKER_URL__` to `/offline-export/workers/*` so WASM fetches are SW‑controlled.
- Optional RP ID override: `buildOfflineExportHtml()` injects `<meta name="tatchi-rpid-base" ...>` when `VITE_RP_ID_BASE` is set; the app uses this or infers a base from the hostname.
- Auto‑starts export when exactly one local account is detected; otherwise waits for click or `OFFLINE_EXPORT_START`.

**Worker URL Resolution (runtime)**
- `resolveWorkerUrl()` reads `window.__W3A_SIGNER_WORKER_URL__` / `window.__W3A_VRF_WORKER_URL__` overrides and an optional `baseOrigin`.
- Ensures worker scripts (and their WASM subrequests) resolve under the offline SW scope when the overrides are set by the route app.

**Wallet Host (Online Path) + Fallback**
- Host renders export UI in‑iframe. If the browser is offline or a hashed chunk import fails, host posts `OFFLINE_EXPORT_FALLBACK`.
- Parent then calls `openOfflineExport()`, which opens a new browser tab to `/offline-export/` on the wallet origin.

**Message Protocol**
- Router/Parent ↔ Offline App (new‑tab flow)
  - App → Parent: `OFFLINE_EXPORT_DONE` on successful viewer show.
  - App → Parent: `OFFLINE_EXPORT_ERROR` with a message on failure.
- Wallet Host → Parent (online viewer only)
  - `WALLET_UI_CLOSED` when the in‑iframe viewer closes.

**Headers and Policies (production)**
- `/offline-export/sw.js` and `/offline-export/index.html`: `Cache-Control: no-cache`.
- Other `/offline-export/*`: `Cache-Control: public, max-age=31536000, immutable`.
- WASM MIME: `application/wasm`.
- Strict CSP for the route; `connect-src 'none'`.
- Cross‑origin isolation headers for reliability: `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Resource-Policy: cross-origin`.
- `Permissions-Policy: publickey-credentials-get=(self); publickey-credentials-create=()`.

**Verification Checklist**
- Online, visit `/offline-export/` once; then go Offline and refresh:
  - No network; no 504s.
  - Export drawer renders; TouchID prompt reaches the platform authenticator.
- Cache Storage contains:
  - `/offline-export/offline-export-app.js`
  - `/offline-export/workers/*` and `/sdk/workers/*`
  - `/sdk/export-private-key-viewer.js`, `/sdk/iframe-export-bootstrap.js`
  - `/sdk/export-viewer.css`, `/sdk/export-iframe.css`
  - Several `/sdk/<prefix>-*.js` chunks (e.g., `common-*.js`, `tags-*.js`, `lit-events-*.js`).
- Service Workers panel shows `OFFLINE_EXPORT_v4` as the active version.

**Troubleshooting**
- If `/offline-export/` returns 504 in dev, a stale SW likely controls the scope:
  - Reload (dev routes set `Cache-Control: no-cache`), or unregister the SW in DevTools and reload.
- If a hashed chunk import fails inside the wallet host (e.g., `localOnly-*.js`), the router falls back to the offline overlay automatically.

**Why this design works**
- Non‑blocking: background tasks are scheduled and detached from initial paint.
- Resilient to churn: manifest merge + prefix‑based fallbacks keep hashed chunks working offline.
- Scoped and safe: cache‑only with explicit 504 for gaps; rpId preserved.
- Zero‑config: dev routes and build steps emit everything needed under stable paths.

**Optional Hardening**
- Connection‑aware priming (skip on `navigator.connection?.saveData` or 2G).
- Inject SW version at build to force upgrades without file edits.
- Add a minimal version banner to `/offline-export/` via SW message ping.





**Quick Fix for 504 “Offline asset not pre‑cached” (dev)**
- Confirm SW control:
  - DevTools → Application → Service Workers → `OFFLINE_EXPORT_v4` is active and controlling.
- Ensure SDK dist exists and is fresh:
  - Run `pnpm -C sdk build` so `dist/esm/sdk/*.js` (e.g., `tx-confirmer-wrapper-*.js`, `common-*.js`) are present.
- Inspect the manifest served by dev plugin:
  - Open `/offline-export/precache.manifest.json` and verify it lists the failing files under `/sdk/…`.
  - If missing, check `computeOfflinePrecacheList()` to ensure it scans `dist/esm/sdk` and you rebuilt the SDK.
- Bump SW version to evict stale caches:
  - Temporarily change `VERSION` in `sdk/src/core/OfflineExport/offline-export-sw.ts`, then reload.
- Clear stale control if needed:
  - Unregister the SW for `/offline-export/`, hard refresh, then re‑visit `/offline-export/` online once to warm caches.
- Re‑test offline:
  - Reload `/offline-export/` with Network=Offline; no 504s should occur.

Notes
- `/favicon.ico` may 404 offline (outside SW scope). Either ignore it or add `/favicon.ico` to the stable precache if you want silence in logs.
- For `/sdk/*` assets, the SW does a network‑once warm when online and then falls back by chunk prefix when offline. You still need one online priming visit.


