# Safari WebAuthn WASM Worker Bugs — Root Cause and Fix

## Summary
- The signer WASM worker was not actually failing to load in Safari. It failed its first message because a control ping `{ type: "WORKER_PING" }` was routed through the worker’s main message path and forwarded to the Rust handler, which expects a numeric enum (`u32`) for `type`.
- This produced errors like: `invalid type: string "WORKER_PING", expected u32`, after which the worker marked itself as processed/closed. The subsequent real request (e.g., `{ type: 8 }`) then failed with “Worker has already processed a message.”
- Fix: stop sending the ping, or ensure control messages are not parsed as typed requests. Optionally harden the worker to ignore any non‑numeric `type` values.

## Symptoms
- Registration/signing flows work in Chrome but fail in Safari.
- Logs show the worker receiving `WORKER_PING` first, then JSON parse errors and “already processed” errors.
- Example messages observed:
  - `[signer-worker] received message – {type: "WORKER_PING"}`
  - `[signer-worker]: Message processing failed: Failed to parse message: invalid type: string "WORKER_PING", expected u32`
  - `worker error response: { … error: "Worker has already processed a message" }`

## Root Cause
- The manager sends an early ping immediately after worker creation for health checks.
  - File: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts:164`
    - `worker!.postMessage({ type: 'WORKER_PING' });`
- The signer worker should ignore control pings, but in Safari the ping was delivered to the main processing path before the ignore guard took effect (or a cached build without the guard was used).
  - Ignore guard (intended): `passkey-sdk/src/core/web3authn-signer.worker.ts:202`
  - Main processing path (where the ping was forwarded to Rust): `passkey-sdk/src/core/web3authn-signer.worker.ts:~180+`
- Rust expects a numeric `type` (u32). Receiving the string `"WORKER_PING"` triggers a parse error, after which the worker marks itself as processed and rejects any subsequent real request.

## Why logs appeared only after upgrading to Safari Technology Preview
- Stable Safari often does not forward console logs from module workers and srcdoc iframes to the main page console by default. You typically need to open the dedicated worker/iframe target in Web Inspector to see them.
- Safari Technology Preview has improved DevTools behavior and forwarding of worker console output, so you started seeing detailed `[signer-worker]` logs there without extra steps.

## Fix
Pick one of these approaches (A recommended, B optional if you must keep a ping):

A) Remove the ping entirely
- Delete the control ping send:
  - `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts:164`
  - The worker already posts a readiness signal: `WORKER_READY` at `passkey-sdk/src/core/web3authn-signer.worker.ts:151`.

B) Keep a control ping but make it unambiguous
- Do not use the `type` field for control messages. For example, send `{ __control: 'WORKER_PING' }` so the Rust JSON parser never sees it as a typed request.
- Alternatively, harden the worker to early‑return on any non‑numeric `type` values before calling into Rust.

## Additional hardening (recommended)
- In `web3authn-signer.worker.ts`, keep and strengthen the guard:
  - Early‑return if `typeof event.data?.type !== 'number'`.
  - Ensure `messageProcessed = true` is set only after validating a first valid numeric message (or after `handle_signer_message` resolves), so control/invalid messages never flip the processed state.
- You already attached a cache‑buster to the worker URL for Safari‑like engines. Keep it to avoid stale worker caching where a previous build might lack the guard.

## Verification checklist
- Create worker → see `WORKER_READY` before any request.
- First processed message is the real numeric request (e.g., `{ type: 8 }`), not `WORKER_PING`.
- No more `invalid type: string "WORKER_PING", expected u32` errors.
- Drawer/Modal confirm flows in Safari proceed to Touch ID/Face ID prompt when the user clicks “Next”, not “User cancelled”.

## File references
- Manager ping sender: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts:164`
- Worker readiness ping: `passkey-sdk/src/core/web3authn-signer.worker.ts:151`
- Worker ignore guard for control pings: `passkey-sdk/src/core/web3authn-signer.worker.ts:202`

---
If you want, I can submit a small PR that removes the ping and adds the non‑numeric guard to the worker so this never regresses on Safari.

## Related Safari error: “The origin of the document is not the same as its ancestors.”

This error appears when WebAuthn APIs (`navigator.credentials.create/get`) are invoked in a document whose ancestor chain is cross‑origin and the browser does not grant the `publickey-credentials-*` permissions to that embedded context.

What’s happening
- Our wallet runs inside an iframe at a dedicated origin (e.g., `https://wallet.example.localhost`). Safari may reject WebAuthn from such frames with the above error unless Permissions Policy is correctly configured and supported by the Safari version.

Fixes and hardening
- Ensure the wallet iframe element carries an `allow` attribute that uses Safari‑recognized Permissions Policy grammar. We now set:
  - `publickey-credentials-get=(self "https://wallet.example.localhost")`
  - `publickey-credentials-create=(self "https://wallet.example.localhost")`
  - plus clipboard entries for embedded UI.
- Fallback: for older engines, we also set a legacy `allow` value with `*` to maximize compatibility.
- Ensure the top‑level responses include a matching `Permissions-Policy` header (dev plugin already sends: `publickey-credentials-get=(self "<walletOrigin>")`, `publickey-credentials-create=(self "<walletOrigin>")`).
- If you must support older Safari versions that do not honor Permissions Policy for WebAuthn in iframes, run the wallet host on the same origin as the parent page (no cross‑origin ancestor), or execute WebAuthn calls in the top‑level page.

References in repo
- Iframe `allow` attribute (updated): `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts`
- Dev server `Permissions-Policy` headers: `passkey-sdk/src/plugins/vite.ts`
