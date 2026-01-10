# WalletIframe Architecture — Discussion & Decisions

This document captures design decisions and trade‑offs discussed while planning the move of sensitive Web3Authn logic into a cross‑origin, headless service iframe, keeping an API‑first SDK for integrators and preserving a no‑popup UX.

## 1) Goals & Non‑Goals

- Goals:
  - Keep `TatchiPasskey` as the parent‑side SDK facade (API‑first) — integrators call JS functions, not embed UI.
  - Mount a hidden, cross‑origin “wallet” iframe on `init()` and keep it READY for requests.
  - Run all sensitive operations in the wallet origin: WebAuthn + PRF, signer/VRF workers, and IndexedDB.
  - Use existing visible iframes (Modal / Embedded Button) to capture user gestures (no popup windows).
  - Return only minimal results (signed txs / verification results) to the parent.
- Non‑Goals:
  - Relying on invisible iframes alone for WebAuthn (fails user‑activation constraints across browsers).
  - Solving supply‑chain/CDN compromise solely via iframe; delivery must be hardened.

## 2) Threat Model & What If An Attacker Has Parent JS

- Same‑origin iframes: Parent can fully script/read them; moving TouchID prompts into a same‑origin iframe does not protect PRF.
- Cross‑origin iframe: Parent cannot read/script the child; only sees postMessage outputs we choose. PRF/credentials stay private.
- Practical exfiltration vectors in compromised parent:
  - Monkey‑patch functions (e.g., `TouchIdPrompt.getCredentials`, serializers).
  - Intercept `postMessage`, `Worker.postMessage`, or add global `message` listeners.
  - Script same‑origin iframes via `contentWindow`.
- Conclusion: Cross‑origin wallet iframe is required for meaningful isolation. It still needs a hardened delivery path.

## 3) SDK UX Requirements

This is an SDK, we should not expect the developer to manually copy html files to arbitrary locations. The current frontend file path will not necessarily exist on the developer's codebase. It must be automatically bundled and built so that the dev merely needs to simplye run `npm install` then `import tatchi from @web3authn/core` in their frontend code.

The main point of this SDK is no reliance on external servers. Hosting the service page on a wallet origin you (the SDK vendor) control and host (e.g., https://wallet.web3authn.xyz/service is volates this objective.


## 4) User Activation & No‑Popup UX

- WebAuthn requires transient user activation in the calling document.
- Activation does not transfer via postMessage; synthetic clicks don’t count.
- Invisible service iframe cannot initiate WebAuthn reliably.
- Solution that preserves “no popups”:
  - Use the inline wallet‑origin custom element (`<w3a-tx-confirmer>`) or the embedded button’s iframe to capture the click inside the wallet origin.
  - Run WebAuthn in that visible wallet element; keep the service iframe invisible for orchestration/storage.
  - Add `allow="publickey-credentials-get; publickey-credentials-create"` on visible wallet iframes.

## 5) Architecture Options Considered

- A) Worker‑in‑iframe, keep current handshake:
  - Keep Rust’s `await_secure_confirmation` flow; move the signer worker into the iframe.
  - The visible wallet iframe handles PROMPT → WebAuthn → USER_CONFIRM_RESPONSE locally.
  - Pros: minimal Rust/TS API change; preserves digest checks.
- B) Pre‑auth request (simpler runtime):
  - Child collects credential/PRF first, then calls a new worker request like `SignTransactionsWithActionsPreAuth`.
  - Pros: cleaner flow, no extra handshake; Cons: requires Rust/TS changes.
- Decision: Start with (A) for speed; consider (B) as Phase 2.


## 6) IndexedDB Placement & Access

- Decision: Move both DBs to the wallet origin (service iframe):
  - `passkeyNearKeysDB` — encrypted keys.
  - `passkeyClientDB` — user records, preferences, authenticator cache, VRF metadata.
- Parent sees a small RPC surface (e.g., `getUser`, `getPreferences`, `getAuthenticatorsByUser`, `storeAuthenticator`, etc.).
- Parent may keep a short‑lived in‑memory cache for UI responsiveness but the wallet is the source of truth.
- Migration: Parent exports any existing records → wallet `REQUEST_IMPORT_*` → wallet stores, parent stops using local DBs.
- DevTools: Users can inspect the wallet origin’s DB via DevTools (that’s expected). Ensure data at rest is encrypted.

## 8) RPC Bridge (Parent ↔ Wallet)

- Bootstrap: window.postMessage CONNECT (with transferable port) → host `READY` on the port. Client prefers `'*'` target until the wallet origin is non‑opaque.
- Transport: `MessageChannel` (`MessagePort`). Correlated requests with `requestId`, timeouts, and origin awareness.
- Parent → Child (selected): `PING`, `PM_SET_CONFIG`, `PM_REGISTER`, `PM_LOGIN`, `PM_SIGN_TXS_WITH_ACTIONS`, `PM_SIGN_AND_SEND_TXS`, `PM_SEND_TRANSACTION`, `PM_SET_CONFIRMATION_CONFIG`, `PM_SET_THEME`, `PM_CANCEL`.
- Child → Parent: `READY`, `PONG`, `PROGRESS`, `PM_RESULT`, `ERROR`.

## 9) Domain, rpId, and Contract Origin Policy

- Register/auth in the wallet origin; rpId should be the registrable domain (e.g., `example.com` for `wallet.example.com`).
- Contract policies supported: `single`, `multiple`, `allSubdomains`.
  - Recommended: `single` for the wallet host or registrable domain.
  - Use `allSubdomains` only if you operate tenant wallet subdomains.

## 10) Visible Wallet UI Components (Re‑use)

- `<w3a-tx-confirmer>`: inline wallet‑origin Lit element that captures the confirm click and runs WebAuthn without a nested iframe.

## 11) Digest Integrity & NEAR/VRF Context

- Keep the current UI digest verification (UI digest == worker digest).
- VRF challenge and NEAR nonce/block height/hash can be generated in the wallet origin (preferred) or passed from parent (not secret).

## 12) Integrator Experience (API‑First)

- Parent keeps calling `TatchiPasskey` APIs (e.g., `signTransactions`, `register`, `webauthnManager.storeAuthenticator()` semantics preserved).
- Under the hood, calls forward to the wallet via RPC. The wallet controls UI momentarily for activation and signs inside its origin.
- No popup windows are used.

## 13) Security Hardening Summary

- Self‑host wallet bundles; fingerprint; SRI; strict CSP; Trusted Types.
- Bundle workers/WASM locally; optional runtime hash check.
- Never surface PRF outputs/credentials outside the wallet origin.
- Iframe permission attribute for WebAuthn; sandbox options compatible with rpId and storage.

## 14) Next Steps

- Parent: implement `WalletIframeRouter` (mount, handshake, RPC, timeouts, origin checks).
- Wallet: implement service page + RPC server; spawn signer/VRF workers; wire DB managers.
- Wire Modal/Embedded flows to run WebAuthn in wallet origin and forward to local signer worker.
- Migrate DBs to wallet origin; add one‑time import.
- Optionally add pre‑auth worker request (Phase 2).

---

This plan preserves the API‑first developer experience, achieves strong isolation for secrets via a cross‑origin wallet iframe, and keeps the “no popups” UX by reusing the existing visible iframes for user activation in the wallet origin.


## Implementation Discussion — Post‑Refactor Updates

Thanks — changes landed to simplify the default same‑origin flow and clarify the separate‑origin path without requiring integrators to copy HTML.

- Removed dev‑only service HTML flow:
  - Deleted `packages/passkey/src/core/WalletIframe/service.html`.
  - Removed the copy step from `packages/passkey/scripts/copy-sdk-assets.sh` that previously copied `service.html` into `frontend/public`.

- Typed asset URL support for bundlers:
  - Added `packages/passkey/src/types/url-modules.d.ts` to declare `*?url` modules as `string` for TypeScript.
  - Client logic supports loading the service host via a module asset URL with `srcdoc` by default, or via a wallet origin URL when configured — no `ts-ignore` needed.

- Dev/build integration:
  - Vite plugin `tatchiDev` serves SDK assets under `/sdk` and the wallet service page at `/wallet-service` (configurable), sets WASM MIME, and applies COOP/COEP + `Permissions-Policy` in dev.
  - Build helper `tatchiBuildHeaders` emits a `_headers` file in the production build (`COOP/COEP/CORP` and `Permissions-Policy`, plus CORS rules for `/sdk`), and creates a minimal wallet service HTML when the app didn’t provide one.

- Documentation for integrators updated:
  - `packages/passkey/README.md` now documents:
    - “WalletIframe (no external hosting required)” — same‑origin `srcdoc` is the default; zero copying or extra servers.
    - “Optional: hosting on a separate wallet origin” — includes an Express example that:
      - Serves SDK assets from `node_modules` under `/sdk` (including workers/WASM).
      - Serves `/service` by returning the HTML from `getWalletServiceHtml('/sdk')`.
      - Configures `TatchiPasskey` with `walletOrigin` and `walletServicePath`.

- Summary of options
  - Self‑contained dev (recommended):
    - Use `tatchiDev({ mode: 'self-contained' })`. One Vite serves the app and wallet routes; Caddy can provide two TLS hosts that both proxy to the same dev server.
    - Serves `/sdk/*` and `/wallet-service` automatically; no copying.
  - Separate wallet origin (for isolation in prod):
    - Deploy the SDK’s `/sdk/*` bundle and a wallet service page at `/wallet-service` on your wallet domain.
    - Use `tatchiBuildHeaders` to emit `_headers`, or configure equivalent headers at your edge.
    - Set `iframeWallet.walletOrigin` (e.g., `https://wallet.myco.com`) and, if needed, `walletServicePath` (default recommended: `/wallet-service`).

If helpful, we can add small Vite/Next.js dev examples showing how to proxy `/sdk` and `/service` using their dev server plugins/rewrites.


### SDK Principles (Reiterated)

- No manual file copying: This is a library/SDK. We cannot expect integrators to place HTML into app‑specific `public/` paths or mirror our folder structure. All required assets must be bundled and resolved automatically so that after `npm install` and `import { TatchiPasskey } from '@tatchi-xyz/sdk'`, the service iframe can load without any manual copying. The default same‑origin `srcdoc` + `wallet-iframe-host.ts?url` approach satisfies this.

- No external vendor servers: A core objective is avoiding reliance on external servers controlled by the SDK vendor. Hosting the service page at a vendor domain (e.g., ~https://wallet.web3authn.xyz/service~) violates this principle. The default remains zero external hosting requirements. The optional separate‑origin mode is for integrators to host on their own wallet origin under their control, not ours.


### Configuration Examples

- Dev (self‑contained):
  - `tatchiDev({ mode: 'self-contained', walletServicePath: '/wallet-service', sdkBasePath: '/sdk' })`

- Separate wallet origin (recommended for isolation):
  - `iframeWallet.walletOrigin = 'https://wallet.example.com'`
  - `iframeWallet.walletServicePath = '/wallet-service'`
  - Serve assets under `'/sdk'` on that origin; use `tatchiBuildHeaders` or equivalent headers.

- Notes:
  - Setting `walletOrigin` makes the iframe cross‑origin; only serving assets from a different absolute URL does not change the iframe document’s origin.
