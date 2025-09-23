# WalletIframe Architecture — Discussion & Decisions

This document captures design decisions and trade‑offs discussed while planning the move of sensitive Web3Authn logic into a cross‑origin, headless service iframe, keeping an API‑first SDK for integrators and preserving a no‑popup UX.

## 1) Goals & Non‑Goals

- Goals:
  - Keep `PasskeyManager` as the parent‑side SDK facade (API‑first) — integrators call JS functions, not embed UI.
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

This is an SDK, we should not expect the developer to manually copy html files to arbitrary locations. The current frontend file path will not necessarily exist on the developer's codebase. It must be automatically bundled and built so that the dev merely needs to simplye run `npm install` then `import passkeyManager from @web3authn/core` in their frontend code.

The main point of this SDK is no reliance on external servers. Hosting the service page on a wallet origin you (the SDK vendor) control and host (e.g., https://wallet.web3authn.xyz/service is volates this objective.


## 4) User Activation & No‑Popup UX

- WebAuthn requires transient user activation in the calling document.
- Activation does not transfer via postMessage; synthetic clicks don’t count.
- Invisible service iframe cannot initiate WebAuthn reliably.
- Solution that preserves “no popups”:
  - Use a visible wallet‑origin modal (existing `IframeTxConfirmer`) or the embedded button’s iframe to capture the click inside the wallet origin.
  - Run WebAuthn in that visible iframe; keep the service iframe invisible for orchestration/storage.
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

- Transport: `MessageChannel` with requestId correlation, timeouts, and origin checks.
- Parent → Child:
  - `PING`, `SET_CONFIG`, `SET_ACCOUNT`
  - `REQUEST_registerPasskey`, `REQUEST_signTransactionsWithActions`
  - DB ops: `getUser`, `getLastUser`, `setLastUser`, `getPreferences`, `updatePreferences`, `getConfirmationConfig`, `getTheme`, `setTheme`, `toggleTheme`, `getAuthenticatorsByUser`, `storeAuthenticator`
- Child → Parent:
  - `READY (protocolVersion)`, `PROGRESS`, `REGISTER_RESULT`, `SIGN_RESULT`, `ERROR`

## 9) Domain, rpId, and Contract Origin Policy

- Register/auth in the wallet origin; rpId should be the registrable domain (e.g., `example.com` for `wallet.example.com`).
- Contract policies supported: `single`, `multiple`, `allSubdomains`.
  - Recommended: `single` for the wallet host or registrable domain.
  - Use `allSubdomains` only if you operate tenant wallet subdomains.

## 10) Existing Visible Iframes (Re‑use)

- `IframeTxConfirmer`: already a wallet‑origin iframe; ideal for capturing the confirm click and running WebAuthn.
- `IframeButtonWithTooltipConfirmer`: embedded wallet‑origin iframe; can run WebAuthn on its own click.
- Add iframe `allow="publickey-credentials-get; publickey-credentials-create"`.

## 11) Digest Integrity & NEAR/VRF Context

- Keep the current UI digest verification (UI digest == worker digest).
- VRF challenge and NEAR nonce/block height/hash can be generated in the wallet origin (preferred) or passed from parent (not secret).

## 12) Integrator Experience (API‑First)

- Parent keeps calling `PasskeyManager` APIs (e.g., `signTransactions`, `register`, `webauthnManager.storeAuthenticator()` semantics preserved).
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

- Programmatic wallet page helper (no copying files):
  - Added `packages/passkey/src/core/WalletIframe/html.ts` with `getWalletServiceHtml(sdkBasePath = '/sdk')` which returns minimal HTML referencing the `wallet-iframe-host` bundle.
  - Lets integrators serve a `/service` route directly from code (e.g., Express) without moving assets.

- Documentation for integrators updated:
  - `packages/passkey/README.md` now documents:
    - “WalletIframe (no external hosting required)” — same‑origin `srcdoc` is the default; zero copying or extra servers.
    - “Optional: hosting on a separate wallet origin” — includes an Express example that:
      - Serves SDK assets from `node_modules` under `/sdk` (including workers/WASM).
      - Serves `/service` by returning the HTML from `getWalletServiceHtml('/sdk')`.
      - Configures `PasskeyManager` with `walletOrigin` and `walletServicePath`.

- Summary of options
  - Zero‑config default (recommended):
    - Do not set `walletOrigin`. The SDK mounts the service iframe same‑origin via `srcdoc` and loads the embedded `wallet-iframe-host` module bundle resolved under `/sdk`.
    - No HTML copying; no external servers.
  - Separate wallet origin (for dedicated‑domain security properties):
    - Host SDK assets on the wallet origin:
  - `/sdk/esm/react/embedded/wallet-iframe-host.js` and the rest of embedded bundles.
      - `/sdk/workers/web3authn-signer.worker.js`, `/sdk/workers/web3authn-vrf.worker.js`, and their WASM files.
    - Expose a `/service` route that returns `getWalletServiceHtml('/sdk')`.
    - Set `walletOrigin` (e.g., `https://wallet.myco.com`) and `walletServicePath` (e.g., `/service`) in `PasskeyManager` configs. The SDK loads that page; no app‑side file copying.

If helpful, we can add small Vite/Next.js dev examples showing how to proxy `/sdk` and `/service` using their dev server plugins/rewrites.


### SDK Principles (Reiterated)

- No manual file copying: This is a library/SDK. We cannot expect integrators to place HTML into app‑specific `public/` paths or mirror our folder structure. All required assets must be bundled and resolved automatically so that after `npm install` and `import { PasskeyManager } from '@web3authn/passkey'`, the service iframe can load without any manual copying. The default same‑origin `srcdoc` + `wallet-iframe-host.ts?url` approach satisfies this.

- No external vendor servers: A core objective is avoiding reliance on external servers controlled by the SDK vendor. Hosting the service page at a vendor domain (e.g., ~https://wallet.web3authn.xyz/service~) violates this principle. The default remains zero external hosting requirements. The optional separate‑origin mode is for integrators to host on their own wallet origin under their control, not ours.


### Configuration Examples

- Same‑origin (default, zero‑config):
  - `sdkBasePath: '/sdk'`
  - Do not set `walletOrigin` — the SDK mounts a same‑origin `srcdoc` iframe and loads `wallet-iframe-host.js` from `/sdk`.

- Separate wallet origin (recommended for isolation):
  - `walletOrigin: 'https://wallet.example.com'`
  - `walletServicePath: '/service'`
  - Optionally serve assets under `'/sdk'` on that origin (used by the service page via `getWalletServiceHtml('/sdk')`).
  - Note: Setting `walletOrigin` is what makes the iframe cross‑origin; using an absolute `sdkBasePath` alone does not change the document’s origin.

- Local development variants:
  - Same‑origin dev: `sdkBasePath: '/sdk'` and proxy `/sdk` to your dev asset server.
  - Cross‑origin dev: `walletOrigin: 'http://localhost:8080'`, `walletServicePath: '/service'` with assets served at `http://localhost:8080/sdk`.
