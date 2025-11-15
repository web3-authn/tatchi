# Emergency Export (Offline‑First PWA) — Implementation TODOs

This page tracks the actionable tasks to ship the offline‑first export route under `/offline-export/`. It focuses on concrete SDK wiring, host integration, app assets, headers, and tests. When all items are checked, the route works fully offline (no network) while preserving WebAuthn rpId binding.

## Purpose
- Provide a pre‑installed, offline‑first route under the rpId domain (`/offline-export/`) that lets users unlock and export their keys locally when the network is down or the site is unreachable.
- Preserve WebAuthn security: keep the origin equal to the rpId so assertions and PRF work offline; do not bypass rpId binding.
- Minimize exfiltration risk: narrow Service Worker scope to `/offline-export/`, block network access, and require user verification before decrypting exports.
- Improve resilience: PWA installability with local caching ensures availability during outages or maintenance; users can verify version from the SW.

## Implementation Approach
- Route and assets
  - Host a minimal app at `/offline-export/` with `index.html`, `app.js`, `app.css`, and `manifest.webmanifest` (PWA start_url = `/offline-export/`).
  - Avoid any network calls in this route; all logic is local and uses Web Crypto + WebAuthn.
- Service Worker (SDK‑provided)
  - Source: `sdk/src/core/offline-export-sw.ts`; built to `dist/workers/offline-export-sw.js` and copied to `/offline-export/sw.js` by `tatchiBuildHeaders` during app builds.
  - Strategy: cache‑only for scope; versioned cache key; merge `/offline-export/precache.manifest.json` if present; respond 504 when not cached.
  - Wallet host silently primes via `navigator.serviceWorker.register('/offline-export/sw.js', { scope: '/offline-export/' })` so the route works offline without explicit navigation.
- Precache and build integration
  - Generate `/offline-export/precache.manifest.json` at build time listing all emitted runtime assets (HTML/JS/CSS, any `*.worker.js`, `*.wasm`, icons/fonts).
  - Ensure all assets are emitted under `/offline-export/` so the SW can precache them and serve offline.
- Unlock/export flow (local only)
  - Require WebAuthn assertion with `userVerification: 'required'` to obtain PRF.
  - Reuse the existing SDK flow: call `SignerWorkerManager.exportNearKeypairUi(accountId)` to perform PRF + worker decryption and display the export UI.
  - No additional local passphrase or bespoke cryptography is introduced.
- Headers and policies
  - `/offline-export/sw.js` and `/offline-export/index.html`: `Cache-Control: no-cache`; other assets under `/offline-export/*`: immutable caching.
  - Strict CSP for the route; `Permissions-Policy: publickey-credentials-get=(self); publickey-credentials-create=()`; `connect-src 'none'`; ensure `application/wasm` for `.wasm`.
- Testing and UX
  - E2E: prime SW once online, toggle browser “Offline”, complete export with zero network requests across Chrome/Safari/Firefox (desktop + mobile).
  - Show an “Offline mode” banner and SW/app version; provide error handling and retry guidance for authenticators; passphrase strength meter and reveal‑on‑hold.

## Status Snapshot
- [x] Service Worker implemented in SDK: cache‑only, narrow scope (`/offline-export/`).
  - Source: `sdk/src/core/offline-export-sw.ts`
- [x] SW built with workers pipeline and shipped in package.
  - Dev/prod scripts bundle to `dist/workers/offline-export-sw.js`.
  - Files: `sdk/scripts/build-dev.sh`, `sdk/scripts/build-prod.sh`
- [x] Package export added for integrators: `@tatchi-xyz/sdk/offline-export-sw`.
  - File: `sdk/package.json`
- [x] Build plugin copies SW to stable path on app builds: `/offline-export/sw.js`.
  - File: `sdk/src/plugins/vite.ts` (in `tatchiBuildHeaders().generateBundle()`)
- [x] Wallet host silently registers SW to prime caches.
  - File: `sdk/src/core/WalletIframe/host/bootstrap.ts`
- [ ] Offline route app (HTML/JS/CSS) and manifest scaffolded and precached.
- [ ] Precache manifest generated from emitted assets.
- [ ] Offline export wiring calls existing `exportNearKeypairUi` (no network).
- [ ] E2E tests proving offline behavior across browsers.

## SDK (done)
- [x] Add offline SW implementation with:
  - [x] Versioned cache name (`OFFLINE_EXPORT::<version>`), cache‑only strategy.
  - [x] Stable precache list (index.html, manifest, precache.manifest.json).
  - [x] Optional merge of `precache.manifest.json` (if present in cache).
  - [x] No network fallback; return 504 for missing assets.
  - [x] Diagnostics via `postMessage` (ping/version).
- [x] Build integration via Bun workers pipeline (dev/prod).
- [x] Export added in package.json (`"./offline-export-sw"`).
- [x] Build plugin copies SW to `/offline-export/sw.js` at build time.
- [x] Silent priming in wallet host (`navigator.serviceWorker.register('/offline-export/sw.js', { scope: '/offline-export/' })`).

## App Route (PWA shell)
- [ ] Create minimal `/offline-export/index.html` with:
  - [ ] SW registration snippet (scope `/offline-export/`).
  - [ ] Link to `/offline-export/manifest.webmanifest`.
  - [ ] Inline or linked `/offline-export/app.css`.
  - [ ] Module script `/offline-export/app.js` (no network fetches).
- [ ] Add `manifest.webmanifest` with icons and `start_url: "/offline-export/"`.
- [ ] Implement client‑side export flow in `app.js`:
  - [ ] Require `userVerification: 'required'` for WebAuthn.
  - [ ] Invoke existing SDK flow: `SignerWorkerManager.exportNearKeypairUi(accountId)`.
  - [ ] Present export viewer UI (already provided by SDK components).
  - [ ] Do not perform any network requests.
- [ ] Strictly avoid `fetch()` and any network APIs in this route.

## Precache Manifest and Assets
- [ ] Generate `/offline-export/precache.manifest.json` during build listing all emitted assets under `/offline-export/`:
  - [ ] HTML/JS/CSS bundles.
  - [ ] Any `*.worker.js` and `*.wasm` used by the export UI.
  - [ ] Icons and fonts.
- [ ] Vite: implement a small plugin (or reuse existing sketch) to collect emitted chunk paths with `fileName.startsWith('offline-export/')` and write the manifest asset.
- [ ] Next.js: emit assets to `public/offline-export/` and generate the same manifest in a build step.
- [ ] Ensure the manifest itself is included in the SW’s stable precache (already covered).

## Headers and Policies
- [ ] Serve with strict headers (Cloudflare Pages/Netlify via `_headers` or platform config):
  - [ ] `/offline-export/sw.js`: `Cache-Control: no-cache`.
  - [ ] `/offline-export/index.html`: `Cache-Control: no-cache`.
  - [ ] `/offline-export/*` (non‑HTML): `Cache-Control: public, max-age=31536000, immutable`.
  - [ ] `Permissions-Policy: publickey-credentials-get=(self); publickey-credentials-create=()`.
  - [ ] CSP for the route: self‑only scripts/styles (hashes if needed), `connect-src 'none'`.
- [ ] Confirm MIME for `.wasm` is `application/wasm`.

## UX and Diagnostics
- [ ] Show “Offline mode” banner and app/SW version string (from SW `postMessage`).
- [ ] Provide guidance for authenticator errors; safe retry.
- [ ] When online, advise “go offline first” for suspected incidents.

## Testing
- [ ] E2E: Prime SW online, then toggle DevTools “Offline” and complete export without any network requests.
- [ ] E2E: Verify wallet host auto‑installs SW (silent priming) and that `/offline-export/` opens offline on first visit.
- [ ] Matrix: Chrome/Safari/Firefox on macOS/iOS/Android; platform authenticators; hardware keys.
  

## Follow‑ups / Nice‑to‑Have
- [ ] Example offline app scaffold under `examples/offline-export/` to demo the flow.
- [ ] Optional SRI on script/style URLs if not embedded.
- [ ] Display current wallet SDK base and origin to aid support.

## File Map (implemented)
- `sdk/src/core/offline-export-sw.ts` — Service Worker source (TypeScript).
- `sdk/scripts/build-dev.sh` — builds SW alongside other workers.
- `sdk/scripts/build-prod.sh` — builds SW alongside other workers (minified).
- `sdk/package.json` — exports `./offline-export-sw` for consumers.
- `sdk/src/plugins/vite.ts` — copies SW to `/offline-export/sw.js` during build.
- `sdk/src/core/WalletIframe/host/bootstrap.ts` — silent SW registration to prime cache.

If you want, I can scaffold the `/offline-export/index.html`, `app.js`, `app.css`, and a Vite plugin to emit `precache.manifest.json` next.
