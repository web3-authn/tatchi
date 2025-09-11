# Wallet Iframe onEvent Hook Bridging

Goal

- Preserve the same developer UX for `onEvent` hooks (registration, login, signing) when flows run inside the wallet iframe. Apps still pass `onEvent` in options; the iframe host streams progress; the parent SDK invokes the app’s callback locally.

Why

- Functions are not structured‑cloneable, so `onEvent` cannot be sent over `postMessage`/`MessagePort`.
- Instead, the wallet host emits structured PROGRESS messages tagged with the request, and the parent SDK relays them to the original callback.

High‑Level Design

1) Host → Parent: PROGRESS channel
- The wallet host wraps `PasskeyManager` calls and translates their internal `onEvent(ev)` into `post({ type: 'PROGRESS', requestId, payload: ev })` messages.
- Reuse existing event shapes for payloads: `RegistrationSSEEvent`, `LoginSSEvent`, `ActionSSEEvent`.
- All PROGRESS posts MUST include `requestId` to correlate with the originating RPC.

2) Parent SDK (client.ts): correlation + callback bridging
- Extend the in‑flight request registry (pending map) to store:
  - `resolve/reject`, `timer`, and `onProgress?: (payload: any) => void`.
- Add an `onProgress` option to the internal `post()` helper; store it in the pending map keyed by `requestId`.
- In `onPortMessage`, if `msg.type === 'PROGRESS'` and `msg.requestId` exists, find the pending entry and invoke `pending.onProgress(msg.payload)`. Do NOT resolve/remove the pending entry; wait for `PM_RESULT` or `ERROR`.
- Important: never attach `options.onEvent` to posted payloads (would cause `DataCloneError`).

3) Parent API (PasskeyManagerIframe): preserve external UX
- For wallet‑origin flows (registration, login, signing), accept `options.onEvent` normally.
- Forward it to `client.post(..., { onProgress: options.onEvent })` so the client bridges PROGRESS events back into the app’s `onEvent` callback.
- Keep broadcasting (sendTransaction) and complex on-chain flows parent‑side so `onEvent` still works locally (no postMessage needed).

Message Protocol

- `PROGRESS` (Child → Parent)
  - `{ type: 'PROGRESS', requestId: string, payload: RegistrationSSEEvent | LoginSSEvent | ActionSSEEvent }`
  - Ordering: PROGRESS events for a given `requestId` are delivered in FIFO order.

- `PM_RESULT` (Child → Parent)
  - `{ type: 'PM_RESULT', requestId: string, payload: { ok: boolean, result?: any, error?: string } }`

- `ERROR` (Child → Parent)
  - `{ type: 'ERROR', requestId: string, payload: { code: string, message: string, details?: any } }`

Scope of PROGRESS Emission

- Emit PROGRESS for wallet‑origin flows where we accept `options.onEvent` on `PasskeyManager`:
  - `registerPasskey`
  - `loginPasskey`
  - `signTransactionsWithActions`
  - `recoverAccountFlow` (single‑endpoint recovery)
- Do NOT forward callbacks in payloads. Always translate events to PROGRESS in the host.
- `sendTransaction`, `executeAction` should remain parent‑side to support `onEvent` without crossing the boundary (already true in the refactor).

Code Changes (Implementation Outline)

- Host: `passkey-sdk/src/core/WalletIframe/wallet-iframe-host.ts`
  - In each RPC handler, when invoking `PasskeyManager`:
    - Build options `onEvent: (ev) => post({ type: 'PROGRESS', requestId, payload: ev })`.
    - Ensure any existing PROGRESS posts (diagnostics) include the same `requestId`.

- Client: `passkey-sdk/src/core/WalletIframe/client.ts`
  - Type `Pending = { resolve, reject, timer, onProgress?: (p) => void }`.
  - Extend `post<T>(envelope, opts?: { onProgress?: (p) => void })` to store `onProgress` in the pending map.
  - In `onPortMessage`: if `msg.type === 'PROGRESS' && msg.requestId`, find pending and invoke `onProgress`.
  - For `registerPasskey`, `loginPasskey`, `signTransactionsWithActions` client methods: pass the app’s `options.onEvent` to `post(..., { onProgress })` and exclude it from payload.

- Iframe wrapper: `passkey-sdk/src/core/WalletIframe/PasskeyManagerIframe.ts`
  - For above flows, accept `options.onEvent` and thread it through to the client’s `onProgress`.
  - Keep `sendTransaction/executeAction` parent‑side.

Error Handling & Cancellation

- Error: host catches exceptions and posts `ERROR` with `requestId`. Client removes the pending entry, clears timer, and rejects the promise (stopping further PROGRESS forwarding).
- Cancel (optional): introduce `PM_CANCEL { requestId }`. Client removes its pending entry and posts cancel; host aborts work if supported.

Performance & Throttling

- Progress events can be frequent during signing. If needed, throttle/coalesce in host or client. Start simple: forward all events; revisit with metrics.

Testing Plan

1) Unit
- Client: verify that PROGRESS with `requestId` triggers `onProgress`; `PM_RESULT` resolves; `ERROR` rejects and stops PROGRESS.
- Host: verify all handlers include `requestId` on PROGRESS.

2) E2E / Manual
- Registration: see a stream of UI steps in the parent app via `onEvent` while the ceremony runs inside wallet origin.
- Login: observe PROGRESS without DataCloneError.
- Signing (batch): confirm PROGRESS events appear and signed tx rehydration works.

Pitfalls & Notes

- Never include functions in posted payloads (structured clone); always translate to PROGRESS.
- Ensure all PROGRESS posts include the correct `requestId` or the client cannot correlate.
- Keep SignedTransaction as plain POJOs over the wire; rehydrate class instances in the client.
- For broadcast, prefer parent‑side so apps can show precise network progress and reuse existing workers.

Future Enhancements

- Add a typed event bus abstraction so wasm worker and wallet iframe PROGRESS share one router.
- Support cancellation with `PM_CANCEL` and propagate to underlying flows.
- Theme/user-preference events: add `PM_THEME_CHANGED` to push preference updates from wallet origin if needed.
