# Web3Authn Service Iframe Architecture Plan

This document outlines how to run all sensitive Web3Authn logic inside a cross‑origin, headless service iframe while keeping an API‑first SDK for developers. The existing visible iframes (Modal and Embedded Button) remain the way to capture user gestures without popups.

## Goals

- Keep `PasskeyManager` as the parent‑side SDK facade (API‑first).
- Mount a hidden, cross‑origin “wallet” iframe on `init()`.
- Run all sensitive components in the iframe: `WebAuthnManager`, `SignerWorkerManager` + `web3authn-signer.worker`, `VrfWorkerManager` + `web3authn-vrf.worker`, and `IndexedDBManager`.
- Forward API calls from parent → iframe via a typed RPC bridge; iframe performs WebAuthn/PRF/signing and returns only signed results.
- Preserve “no popups”: use the existing wallet‑origin Modal/Embedded Button iframes for user activation, not browser popups.

## High‑Level Design

- Parent SDK (`PasskeyManager`):
  - Public APIs unchanged: `register`, `signTransactions`, `signAndSendTransactions`, etc.
  - On `init(options)`, mounts an invisible iframe to `walletOrigin` and performs a READY handshake over a `MessageChannel`.
  - Each API call sends a typed RPC request to the iframe and awaits a typed response with `requestId` correlation, timeouts, and cancellation.

- Service Iframe (wallet origin):
  - Loads a minimal wallet bundle under strict CSP; no third‑party runtime CDNs.
  - Spawns signer + VRF workers; owns IndexedDB for encrypted keys.
  - Implements RPC handlers: on `REQUEST_signTransactionsWithActions` or `REQUEST_registerPasskey` performs WebAuthn and calls local workers; returns only signature/signed txs.
  - For WebAuthn user activation, coordinates a visible wallet‑origin modal (existing `IframeModalConfirmer`) or the embedded button flow; no new popups.

## Components & Ownership

- Parent (integrator origin):
  - `PasskeyManager/index.ts` facade.
  - Small, non‑secret helpers are allowed (e.g., digest formatting). Do not handle PRF/credentials/decrypted keys here.

- Service Iframe (wallet origin):
  - `WebAuthnManager`: calls `navigator.credentials.*` with PRF extensions.
  - `SignerWorkerManager` + `web3authn-signer.worker`: PRF → decrypt/derive → sign.
  - `VrfWorkerManager` + `web3authn-vrf.worker`: challenge generation and verification helpers.
  - `IndexedDBManager`: both `passkeyClientDB` (user data, preferences, authenticators) and `passkeyNearKeysDB` (encrypted keys) live under the wallet origin.
  - Optional: NEAR RPC client for nonce/block height/hash (can also accept those from parent; they are not secrets).

- Gesture Capture (wallet origin):
  - Modal path: existing `IframeModalConfirmer` is made visible briefly to capture click/confirm in the wallet origin, then hidden.
  - Embedded path: existing `IframeButtonWithTooltipConfirmer` captures a click in its own iframe; WebAuthn runs there.

## Boot Sequence

1. Parent app constructs `PasskeyManager` and (optionally) sets `walletOrigin` in configs. React’s provider auto‑inits; bare JS calls `initWalletIframe()`.
2. Parent mounts hidden service iframe:
   - Preferred (no external hosting): uses `srcdoc` with an imported module asset URL resolved by the consumer bundler (e.g., `wallet-iframe-host.ts?url`). This keeps the service same‑origin and sandboxed, without copying HTML.
   - Optional (custom wallet site): if `walletOrigin` is set, loads `new URL(servicePath, walletOrigin)` instead.
   - Opens a `MessageChannel` and performs READY/PING handshake with protocol version check.
3. Service iframe loads wallet bundle, applies strict CSP, spawns signer/VRF workers, opens IndexedDB, and posts `READY`.

## RPC Protocol (MessageChannel)

- Transport: `MessageChannel` to avoid global `message` noise. Post with pinned `targetOrigin` and verify `event.origin`.
- Envelope: `{ type: string; requestId?: string; payload?: any; }` (typed in TS).
- Parent → Child:
  - `PING`
  - `SET_CONFIG` (theme, language)
  - `SET_ACCOUNT` (active account id)
  - `REQUEST_registerPasskey` (nearAccountId, registration options)
  - `REQUEST_signTransactionsWithActions` (nearAccountId, txSigningRequests, options)
- Child → Parent:
  - `READY` (protocolVersion)
  - `PROGRESS` (step/status/message)
  - `REGISTER_RESULT` (public data only)
  - `SIGN_RESULT` (signed tx(s) only)
  - `ERROR` (code/message)

Implementation notes:
- Use `requestId` correlation for every request/response pair.
- Add per‑call timeouts and cancellation tokens.
- Define TS types under `src/core/WalletIframe/messages.ts`.

## WebAuthn Flow (No Popups)

- Parent calls `signTransactions()` inside a user gesture handler.
- Parent forwards `REQUEST_signTransactionsWithActions` to service iframe.
- Service iframe brings up a wallet‑origin visible modal (existing `IframeModalConfirmer`) to capture the confirm click.
- WebAuthn runs inside the wallet origin context and returns PRF/credential only within the wallet process boundary.
- Service iframe passes PRF/credential to its local signer worker, signs transactions, and returns only signed txs to the parent.
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

## Origin & Contract Policy

- Register/auth in the wallet origin; set `rpId` to the registrable domain (e.g., `example.com` for `wallet.example.com`).
- Contract policy:
  - `single` for the wallet host (tightest), or registrable domain if you want reuse.
  - `allSubdomains` if using tenant subdomains for the wallet.
  - Avoid letting app hosts call WebAuthn natively.

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
  - Add `WalletIframeClient` (mount iframe, handshake, MessageChannel, request/response).
  - Wire `PasskeyManager` APIs to forward to the client.
  - Add configuration for `walletOrigin` and theme.

- Service Iframe (wallet)
  - Create wallet service page/bundle with strict CSP.
  - Implement RPC server and handlers for `REQUEST_signTransactionsWithActions`/`REQUEST_registerPasskey`.
  - Spawn signer/VRF workers; wire to `WebAuthnManager` and `IndexedDBManager`.
  - Integrate existing `IframeModalConfirmer` for confirm UI; close after completion.

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
