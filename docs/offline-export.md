# Emergency Export (Offline‑First PWA Route)

Purpose: provide a pre‑installed, offline‑first route under the rpId domain that lets users unlock and export their keys locally using WebAuthn (and an optional second factor) even when the network is down or the site is unreachable. This reduces reliance on network availability; it does not bypass WebAuthn rpId binding.

## Goals
- Allow export/unlock when online services are degraded or unreachable.
- Run entirely client‑side with no network dependency for the export path.
- Keep origin identical to the rpId so WebAuthn continues to work offline.
- Minimize exfiltration risk if the domain is later compromised.

## Non‑Goals
- Bypassing rpId. If users never primed/installed the route on a device, and the rpId origin cannot be loaded, offline export is not possible on that device.
- Serving as a general wallet UI; this is a minimal emergency utility.

## High‑Level Design
- Dedicated route under the rpId domain: `/offline-export/`.
- Minimal static app: `/offline-export/index.html` + small JS bundle.
- Service Worker (SW) scoped only to `/offline-export/` that precaches all required assets and serves them cache‑only.
- Web App Manifest with `start_url: "/offline-export/"` so users can install it as a PWA.
- Export flow performs WebAuthn + local decryption only; no `fetch()` calls.
- Optional second factor (local passphrase via Argon2) to gate export.

## Can This Work Without a Service Worker?
- Short answer: not reliably. To guarantee offline execution under your rpId origin, a Service Worker is the standard, supported mechanism.
- Why SW matters:
  - It serves assets when the network is unavailable, keeping the origin string intact (required by WebAuthn).
  - It can enforce cache‑only behavior to prevent accidental online updates during an incident.
  - Modern installability (A2HS) typically expects both a manifest and a Service Worker.
- What happens without SW:
  - You rely on the HTTP cache. Some browsers may still show the page from cache, but behavior is inconsistent and can break after cache eviction or header changes.
  - You cannot block the network, so a hostile update (domain compromise) could replace assets when the user opens online.
- Conclusion: SW is critical for a dependable offline‑first export route. You can add cache‑friendly headers as a belt‑and‑suspenders, but do not drop the SW.

## Files and Structure
- `/offline-export/index.html` — minimal HTML shell; registers SW; links manifest.
- `/offline-export/app.js` — export flow logic (WebAuthn, decrypt, UI).
- `/offline-export/app.css` — local styles; inline small CSS where possible.
- `/offline-export/sw.js` — Service Worker for the route.
- `/offline-export/manifest.webmanifest` — PWA metadata + icons.
- Any local runtime dependencies (workers/wasm) copied under `/offline-export/` and included in the precache list.

## Service Worker Strategy
- Scope: `/offline-export/` only. Do not interfere with the rest of the site.
- Install: precache a fixed, versioned list of assets (HTML/JS/CSS/wasm/icons).
- Activate: `self.clients.claim()`; consider `skipWaiting()` to speed adoption during maintenance windows (not during incidents; see rollout below).
- Fetch: cache‑only for URLs under scope. Block or warn on any network access.
- Versioning: bump a cache version (e.g., `OFFLINE_EXPORT_v2025_01_01`) for releases.

Example SW (sketch):
```js
const CACHE = 'OFFLINE_EXPORT_v2025_01_01';
const PRECACHE = [
  '/offline-export/',
  '/offline-export/index.html',
  '/offline-export/app.js',
  '/offline-export/app.css',
  '/offline-export/manifest.webmanifest',
  // '/offline-export/worker.js', '/offline-export/signer.wasm', ...
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/offline-export/')) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((res) => res || new Response('Not cached', { status: 504 }))
    );
    return;
  }
});
```

## Web App Manifest
Minimal example:
```json
{
  "name": "Emergency Export",
  "short_name": "Export",
  "start_url": "/offline-export/",
  "scope": "/offline-export/",
  "display": "standalone",
  "background_color": "#0b0b0c",
  "theme_color": "#0b0b0c",
  "icons": [
    { "src": "/offline-export/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/offline-export/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## Registration Snippet
Add to `/offline-export/index.html`:
```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/offline-export/sw.js', { scope: '/offline-export/' });
}
</script>
<link rel="manifest" href="/offline-export/manifest.webmanifest" />
```

## Export Flow (Client‑Side)
- Gate the UI behind WebAuthn assertion with `userVerification: 'required'` for the rpId.
- Derive/decrypt the private key locally (e.g., using WebAuthn PRF if applicable, plus app‑specific KDF/salt).
- Strongly recommended: require a user passphrase, stretched with Argon2, combined with passkey‑derived material (passkey + passphrase).
- Present export with clear warnings; avoid persisting plaintext to storage; offer copy or downloadable encrypted backup with a user‑chosen passphrase.

### Passphrase Second Factor (Argon2) — Outline
Objective: reduce exfiltration risk if the domain is compromised by requiring both the platform authenticator (WebAuthn) and a user‑remembered secret.

Key material sources
- K_passkey: derived from WebAuthn PRF output for the credential (recommended), using a fixed label like `offline-export-v1`. If PRF is unavailable, derive a per‑credential wrapping secret during enrollment and unwrap it via WebAuthn assertion at use time.
- K_pass: Argon2id(passphrase, salt_pass, params) → 32 bytes.

Recommended Argon2id params (tune per device)
- timeCost: 3
- memoryCost: 64–128 MiB on mobile, 128–256 MiB on desktop
- parallelism: 1–2
- hashLen: 32

Combining keys
- Use HKDF to derive a KEK: `KEK = HKDF(ikm = K_pass || K_passkey, salt = salt_kek, info = 'w3a-offline-export-v1', len = 32)`.
- Use `KEK` to encrypt/decrypt the export envelope with AES‑256‑GCM.

Enrollment flow (enable 2nd factor)
1) Generate `salt_pass` (16–32 bytes) and `salt_kek` (16–32 bytes). Store both locally alongside the encrypted envelope metadata.
2) Ask the user to set a passphrase and confirm it; derive `K_pass` via Argon2id.
3) Obtain `K_passkey` via WebAuthn PRF or create a per‑credential wrapping secret and encrypt it under a WebAuthn‑derived key.
4) Derive `KEK` via HKDF(K_pass || K_passkey, salt_kek) and wrap the private key (or export blob) with AES‑GCM.
5) Persist only: salts, AES‑GCM ciphertext + iv + tag, and any PRF/envelope metadata. Never store the passphrase.

Unlock/export flow
1) Require passphrase entry and WebAuthn assertion (user verification required).
2) Derive `K_pass` with Argon2id and obtain `K_passkey` via PRF/unwrapped secret.
3) Compute `KEK` and decrypt the AES‑GCM envelope locally.
4) Display/export the result, or allow download of an encrypted backup (with a separate user‑chosen passphrase if desired).

Libraries and notes
- Argon2: bundle a WASM implementation (e.g., argon2‑browser/argon2‑wasm) and include it in the SW precache list.
- HKDF/AES‑GCM: use Web Crypto API (`crypto.subtle`) for HKDF and AES.
- UX: show an entropy meter and guidance for strong passphrases; allow “reveal” with hold‑to‑reveal.
- Performance: calibrate Argon2 parameters at runtime and persist chosen params per device.

## Build & Packaging
- Vite: add a small sub‑app entry for `/offline-export/` and copy all needed runtime files to that folder at build time. Emit a precache manifest (list of fingerprints) for SW.
- Next.js: place the bundle under `public/offline-export/` or emit via a script; keep the SW unmanaged by Next’s router.
- Integrity: pin assets with SRI in `index.html` if loaded by URL; otherwise rely on SW cache versioning.
- Minimize bundle size; inline critical CSS; avoid remote fonts.

## Worker/WASM Loading Strategy (with Existing Infra)
Goal: ship the Service Worker, any web workers, and wasm artifacts using the same build pipeline while keeping the SW path stable and precached assets fingerprinted.

- Service Worker path and registration
  - Keep a stable URL: `/offline-export/sw.js` (do NOT fingerprint).
  - Register via `navigator.serviceWorker.register('/offline-export/sw.js', { scope: '/offline-export/' })`.
  - Consider `Service-Worker-Allowed: /offline-export/` header if you ever widen scope.
  - Headers: `Cache-Control: no-cache` for `sw.js` so updates are detected.

- Asset precache (workers/wasm)
  - Precache all assets used by the export flow: HTML, JS, CSS, icons, any `*.worker.js`, `*.wasm`, fonts.
  - Fingerprint these assets (default in bundlers) and include them in the SW’s precache list.
  - Ensure assets resolve to same‑origin URLs under `/offline-export/`.

- Vite (examples/*) integration
  - Place `sw.js`, `manifest.webmanifest`, icons under `public/offline-export/` so they publish at stable paths.
  - Build the export sub‑app entry and emit its chunks to `/offline-export/`.
  - Add a small Rollup/Vite plugin to generate a precache manifest from the emitted chunks:
    ```js
    // vite.config.ts (sketch)
    function offlineExportPrecache() {
      return {
        name: 'offline-export-precache',
        generateBundle(_, bundle) {
          const files = Object.values(bundle)
            .filter((item) => 'fileName' in item && item.fileName.startsWith('offline-export/'))
            .map((item) => '/' + item.fileName);
          this.emitFile({
            type: 'asset',
            fileName: 'offline-export/precache.manifest.json',
            source: JSON.stringify(files, null, 2),
          });
        },
      };
    }
    ```
  - In `sw.js`, read and merge the manifest during install (import or inline at build). Avoid network fetch; the manifest itself is precached.

- Next.js (examples/next-js) integration
  - Place `sw.js`, `manifest.webmanifest`, icons under `public/offline-export/`.
  - Emit the export bundle to `public/offline-export/` (via custom script or next‑build step) and generate `precache.manifest.json` as above.
  - Registration code is the same.

- Headers (static hosting/CDN)
  - `/offline-export/sw.js`: `Cache-Control: no-cache`
  - `/offline-export/index.html`: `Cache-Control: no-cache`
  - `/offline-export/*` (static assets other than HTML/SW): `Cache-Control: public, max-age=31536000, immutable`
  - `/offline-export/*`: strict CSP and `Permissions-Policy: publickey-credentials-get=(self); publickey-credentials-create=()`; `connect-src 'none'`.

- Notes for wasm and worker imports
  - Use same‑origin relative paths and include outputs under `/offline-export/`.
  - Add emitted `*.wasm` and `*.worker.js` to the precache manifest so they load offline.
  - See also: `docs/deployment/asset-url-resolution.md` for asset URL patterns.

## Deployment & Governance
- Host under the rpId domain (e.g., `wallet.example.org/offline-export/`).
- Publish and communicate the route as “Emergency Export (offline)”. Encourage users to:
  1) Visit the route once while online (to cache), 2) Install to home screen, 3) Verify it opens offline.
- During routine updates: bump cache version and test offline behavior; do not auto‑update right before a high‑risk event.

## Incident Playbook
- Suspected domain compromise: instruct users to go offline (airplane mode) before opening the installed PWA. This prevents a hostile update.
- Outage (no compromise): opening online is fine; assets are served cache‑first and network is unused.
- Verification: display the app version/hash from the SW cache in the UI so users can confirm they’re on a known good build.

## Security Considerations
- rpId binding remains. If users did not previously cache/install on a device, offline export is unavailable on that device.
- Add a second factor (local passphrase) to mitigate export under domain seizure + user trickery.
- Keep the SW scope narrow to reduce attack surface; block all cross‑scope requests.
- Prefer deterministic, version‑locked asset lists; avoid dynamic imports.

## Permissions‑Policy / Headers
- No cross‑origin delegation required for offline export (same origin). Keep a tight `Permissions-Policy` and CSP. Example:
  - `Permissions-Policy: publickey-credentials-get=(self), publickey-credentials-create=()`
  - Strict CSP with only `self` script/style sources (hashes if needed) and `connect-src 'none'` to ensure no network.

## Testing Checklist
- Prime once online; then toggle DevTools to “Offline” and verify the app fully works.
- Ensure no network requests are made (DevTools network tab stays empty).
- WebAuthn works offline on platform authenticators (Chrome/Safari/Firefox, macOS/iOS/Android).
- Passphrase KDF latency acceptable on low‑end devices (target <500ms Argon2).
- E2E: Playwright flow that installs SW, goes offline, completes export.

## Limitations
- Requires prior visit/install on that device.
- If rpId control is lost and users haven’t cached the route, you cannot onboard new devices until control is restored.
- Users must avoid opening the route online during an active compromise to prevent malicious updates.

## Execution TODOs (Ordered)
1) Define scope and security posture
   - [ ] Confirm minimal features for emergency export only; no external network access.
   - [ ] Decide PRF usage and fallback (wrapped secret) for environments without WebAuthn PRF.

2) Route skeleton and assets
   - [ ] Create `/offline-export/` app shell (HTML/CSS/JS) with clear warnings and minimal UI.
   - [ ] Add `manifest.webmanifest` + icons; verify PWA installability (iOS/Android/Desktop).
   - [ ] Add version string (built at compile time) for display and support.

3) Service Worker (SW)
   - [ ] Place SW at stable path `/offline-export/sw.js` (non‑fingerprinted); register with scope `/offline-export/`.
   - [ ] Implement cache‑only strategy under scope; block network; version via cache name.
   - [ ] Implement safe update: only activate new SW on next launch; expose app version in UI.

4) Build integration and precache
   - [ ] Generate `offline-export/precache.manifest.json` from emitted chunks (Vite/Next build step).
   - [ ] Include all runtime assets: HTML/JS/CSS, `*.worker.js`, `*.wasm`, fonts, icons.
   - [ ] Ensure same‑origin URLs under `/offline-export/` (see docs/deployment/asset-url-resolution.md).

5) Headers and policies
   - [ ] Set `Cache-Control: no-cache` for `sw.js` and `index.html`; immutable caching for other static assets.
   - [ ] Apply strict CSP for the route; `connect-src 'none'`; scripts/styles limited to self/hashes.
   - [ ] Apply `Permissions-Policy: publickey-credentials-get=(self); publickey-credentials-create=()`.
   - [ ] Wire headers in `templates/wallet-dist/_headers` and any CDN/Cloudflare worker config.

6) WebAuthn gating and rpId checks
   - [ ] Require `userVerification: 'required'` in `navigator.credentials.get()`.
   - [ ] Verify rpId resolution under standalone PWA on Chrome, Safari, Firefox (macOS/iOS/Android).
   - [ ] Add UX for authenticator errors and retry guidance.

7) Passphrase second factor (Argon2id)
   - [ ] Implement passphrase UI with entropy meter and reveal‑on‑hold.
   - [ ] Derive `K_pass` (Argon2id with calibrated params); obtain `K_passkey` (PRF or unwrap flow).
   - [ ] Combine via HKDF → `KEK`; AES‑GCM wrap/unwrap export envelope.
   - [ ] Store only salts and ciphertext metadata; never persist plaintext or passphrase.

8) UX hardening
   - [ ] Display “offline mode” banner and app/SW version hash.
   - [ ] Add “go offline first” detector and advisory when online during suspected incident.
   - [ ] Disable telemetry/analytics entirely on this route.

9) Testing and performance
   - [ ] E2E tests: install SW, toggle offline, complete export across Chrome/Safari/Firefox.
   - [ ] Performance: calibrate Argon2 params per device; target <500ms on low‑end phones; persist chosen params.
   - [ ] QA matrix: macOS/iOS/Android; platform authenticators; hardware keys.

10) Release and docs
   - [ ] Release process: bump cache version, regenerate precache, verify offline before publishing.
   - [ ] Add user guide + incident playbook; link from Getting Started and Recovery docs.
   - [ ] Add a nav link to this page in VitePress and surface an FAQ: “Why SW is required; how to use offline safely”.

## Related Docs
- Decentralization and robustness notes in wallet‑scoped credentials.
- DNS/IPFS/Arweave docs: hosting diversity improves asset durability but does not change rpId continuity.
