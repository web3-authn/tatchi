# Wallet Iframe Architecture (Current Implementation)

This document outlines how to run all sensitive Web3Authn logic inside a cross‑origin, headless service iframe while keeping an API‑first SDK for developers. The existing visible iframes (Modal and Embedded Button) remain the way to capture user gestures without popups.

## Goals

- Keep `PasskeyManager` as the parent‑side SDK facade (API‑first).
- Mount a hidden, cross‑origin “wallet” iframe on `init()`.
- Run all sensitive components in the iframe: `WebAuthnManager`, `SignerWorkerManager` + `web3authn-signer.worker`, `VrfWorkerManager` + `web3authn-vrf.worker`, and `IndexedDBManager`.
- Forward API calls from parent → iframe via a typed RPC bridge; iframe performs WebAuthn/PRF/signing and returns only signed results.
- Preserve “no popups”: use the existing wallet‑origin Modal/Embedded Button iframes for user activation, not browser popups.

## High‑Level Design

- Parent SDK (`PasskeyManager`):
  - Public APIs unchanged: `register`, `login`, `signTransactionsWithActions`, `signAndSendTransactions`, `sendTransaction`, etc.
  - On init (via router/provider), mounts an invisible iframe to `walletOrigin` (or same‑origin in dev via Vite plugin) and performs a CONNECT→READY handshake using a `MessageChannel`.
  - Each API call sends a typed RPC request to the iframe and awaits a typed response with `requestId` correlation, progress events, timeouts, and cancellation.

- WalletIframe (wallet origin):
  - Loads the host module (`/sdk/wallet-iframe-host.js`) from the wallet origin (dev: served by `tatchiDev`; prod: deployed with your wallet site) under COOP/COEP + Permissions‑Policy.
  - Spawns signer + VRF WASM workers; owns IndexedDB for encrypted key material and user prefs on the wallet origin.
  - Implements RPC handlers for PM_* messages; performs WebAuthn and calls local workers; returns only sanitized results (signed txs, signatures, status).
  - For WebAuthn user activation, coordinates visible wallet‑origin surfaces (modal/drawer or embedded button) and never opens popups.

## Components & Ownership

- Parent (integrator origin):
  - `PasskeyManager/index.ts` facade.
  - Small, non‑secret helpers are allowed (e.g., digest formatting). Do not handle PRF/credentials/decrypted keys here.

- WalletIframe (wallet origin):
  - `WebAuthnManager`: calls `navigator.credentials.*` with PRF extensions.
  - `SignerWorkerManager` + `web3authn-signer.worker`: PRF → decrypt/derive → sign.
  - `VrfWorkerManager` + `web3authn-vrf.worker`: challenge generation and verification helpers.
  - `IndexedDBManager`: both `passkeyClientDB` (user data, preferences, authenticators) and `passkeyNearKeysDB` (encrypted keys) live under the wallet origin.
  - Optional: NEAR RPC client for nonce/block height/hash (can also accept those from parent; they are not secrets).

- Gesture Capture (wallet origin):
  - Modal path: the inline `<w3a-tx-confirmer>` element is shown briefly to capture click/confirm in the wallet origin, then hidden.
  - Embedded path: existing `IframeButtonWithTooltipConfirmer` captures a click in its own iframe; WebAuthn runs there.

## Boot Sequence

1. Parent constructs `PasskeyManager` with `iframeWallet.walletOrigin` (recommended) and optional `walletServicePath` (defaults: SDK transport uses `/service`; dev plugin + examples use `/wallet-service`).
2. Parent mounts a hidden service iframe pointed at `${walletOrigin}${walletServicePath}` and opens a `MessageChannel`.
3. Parent posts `CONNECT` (window.postMessage with transferable port). Wallet host adopts the port and replies with `READY { protocolVersion }`.
4. Parent sends `PING` for liveness or `PM_SET_CONFIG` to configure RPC URL, contractId, theme, assets base; wallet replies with `PONG`.
5. Wallet host prewarms workers/IDB and bridges theme to `documentElement`.

## Protocol (Window + MessagePort)

- Bootstrap: window.postMessage CONNECT (with a MessagePort) → READY on port. Prior to READY, the client prefers `'*'` target until the wallet origin is non‑opaque.
- Transport: MessagePort (typed envelopes). Envelope: `{ type: ParentToChildType|ChildToParentType; requestId?: string; payload?: any; }`.
- Parent → Child (selected): `PING`, `PM_SET_CONFIG`, `PM_REGISTER`, `PM_LOGIN`, `PM_SIGN_TXS_WITH_ACTIONS`, `PM_SIGN_AND_SEND_TXS`, `PM_SEND_TRANSACTION`, `PM_SET_CONFIRMATION_CONFIG`, `PM_SET_THEME`, `PM_CANCEL`.
- Child → Parent: `READY`, `PONG`, `PROGRESS`, `PM_RESULT { ok, result? }`, `ERROR { code, message }`.

Notes:
- Every request uses a `requestId` for correlation and emits `PROGRESS` events for long operations.
- `PM_CANCEL` triggers in‑iframe UI cancel events and terminates the original request with a terminal cancellation error.

## WebAuthn & User Activation

- Use wallet‑origin visible surfaces to satisfy user activation; the service iframe stays hidden.
- Iframe `allow` includes `publickey-credentials-get/create` (plus clipboard). The front sets `Permissions‑Policy` delegations; dev/build helpers are provided (`tatchiDevHeaders`, `tatchiBuildHeaders`).
- Safari cross‑origin bridge: when in‑iframe WebAuthn is blocked, the wallet host requests the parent to run WebAuthn at top‑level; the parent only honors bridge requests from the wallet origin and returns serialized credentials with PRF outputs.

## WebAuthn Flow (No Popups)

- Parent calls `signTransactions()` inside a user gesture handler.
- Parent forwards `REQUEST_signTransactionsWithActions` to service iframe.
- WalletIframe brings up the wallet‑origin `<w3a-tx-confirmer>` element to capture the confirm click.
- WebAuthn runs inside the wallet origin context and returns PRF/credential only within the wallet process boundary.
- WalletIframe passes PRF/credential to its local signer worker, signs transactions, and returns only signed txs to the parent.
- The modal closes; the hidden service iframe remains mounted for future requests.

Notes:
- For embedded button flows, WebAuthn can run directly in the embedded wallet‑origin iframe (same origin as service) and forward to the local worker.
- Iframe attributes for visible wallet UI: include `allow="publickey-credentials-get; publickey-credentials-create"`.

## Workers & WASM

- Instantiate signer/VRF workers inside the wallet origin:
  - `new Worker(new URL('web3authn-signer.worker.js', import.meta.url), { type: 'module' })`.
  - Ensure the WASM asset paths resolve relative to the wallet bundle (`resolveWasmUrl`).
- Optional integrity checks: fetch WASM bytes and verify SHA‑256 before init.

## Storage & Migration

- Consolidate both DBs in the wallet iframe:
  - `passkeyNearKeysDB` (encrypted keys)
  - `passkeyClientDB` (user records, preferences, authenticator cache, VRF metadata)
- The wallet origin is the single source of truth; the parent never reads/writes these stores directly.
- Parent interacts via a small RPC surface (see section below) and may optionally soft‑cache non‑secret UI state in memory for responsiveness.
- Store encrypted keys and sensitive metadata only in the wallet origin.
- If keys exist in the parent origin, provide a one‑time migration path:
  - Parent exports encrypted blobs → sends to wallet via `REQUEST_IMPORT_KEYS` → wallet stores in its DB.

## IndexedDB Placement & Parent API Surface

- API stability: keep the `PasskeyManager` → `WebAuthnManager` surface similar (e.g., `storeAuthenticator`, `getConfirmationConfig`, `getTheme`). Under the hood, these calls are forwarded over RPC to the wallet iframe.
- Suggested RPC methods (parent → wallet):
  - User/account: `getUser(accountId)`, `getLastUser()`, `setLastUser(accountId, deviceNumber)`, `hasPasskeyCredential(accountId)`
  - Preferences: `getPreferences(accountId)`, `updatePreferences(accountId, partial)`, `getConfirmationConfig(accountId)`, `getTheme(accountId)`, `setTheme(accountId)`, `toggleTheme(accountId)`
  - Authenticators: `getAuthenticatorsByUser(accountId)`, `storeAuthenticator(record)`
- The wallet iframe validates inputs, updates its IndexedDB, and returns typed results. The parent may keep a short‑lived in‑memory cache for UI but must treat the wallet as authoritative.

## Error Handling & Telemetry

- Standardize errors: `{ code, message, details? }` across RPC and SDK APIs.
- Apply per‑call timeouts and cancellation.
- Emit progress events (`PROGRESS`) for UX.

## Security Hardening (Wallet Origin)

- Self‑host wallet assets (no runtime third‑party CDN).
- Fingerprint bundles; apply SRI on module scripts where applicable.
- Strict CSP (example):
  - `default-src 'none'; script-src 'self' 'strict-dynamic'; connect-src 'self' https://rpc.allowlist; img-src 'self'; style-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'`
  - Adopt Trusted Types: `require-trusted-types-for 'script'`.
- Iframe: `allow="publickey-credentials-get; publickey-credentials-create"`.
- Do not expose PRF/credential outside the wallet origin.

## Origin & RP/Contract Policy

- Wallet‑scoped credentials (recommended): rpId is the wallet domain (or registrable base) and is announced by the wallet host. For cross‑site embeddings, Related Origin Requests (ROR) must allow top‑level apps via `/.well-known/webauthn`.
- Contract policy should reflect chosen scope; ensure on‑chain checks accept the intended `rpId`/origins.

## Phased Rollout

- Phase 1 (MVP):
  - Mount hidden service iframe; keep existing Modal/Embedded visible flows for activation.
  - Move `WebAuthnManager`, signer/VRF workers, and IndexedDB into wallet origin.
  - Parent APIs forward requests; child returns signed results.

- Phase 2 (Cleanup/Optional):
  - Introduce a pre‑auth worker request (skip internal `awaitSecureConfirmation` handshake) where the child collects credential/PRF first and directly calls a `SignTransactionsWithActionsPreAuth` path.
  - Add key migration helpers and richer telemetry.

## Implementation Checklist

- Parent SDK
  - Add `WalletIframeRouter` (mount iframe, handshake, MessageChannel, request/response).
  - Wire `PasskeyManager` APIs to forward to the client.
  - Add configuration for `walletOrigin` and theme.

- WalletIframe (wallet)
  - Create wallet service page/bundle with strict CSP.
  - Implement RPC server and handlers for `REQUEST_signTransactionsWithActions`/`REQUEST_registerPasskey`.
  - Spawn signer/VRF workers; wire to `WebAuthnManager` and `IndexedDBManager`.
  - Integrate `<w3a-tx-confirmer>` for confirm UI; close after completion.

- Shared
  - Define TS types for RPC envelopes and payloads.
  - Add tests: origin checks, timeouts, NotAllowedError handling, digest verification parity.

## Integrator Experience (Unchanged API)

- Initialization:
  - `const client = createWeb3AuthnClient({ walletOrigin: 'https://wallet.example.com' });`
  - `await client.init();`
- Usage (no popups):
  - `const result = await client.signTransactions({ nearAccountId, transactions });`
  - SDK mounts a visible wallet modal only when needed to capture the click, then hides it automatically; all sensitive work happens in the wallet origin.
