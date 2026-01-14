# Wallet Iframe onEvent Bridging (post‑implementation)

This document explains how app‑provided `onEvent` callbacks are bridged across the wallet iframe boundary using a `PROGRESS` envelope and a local `onProgress` wrapper. It documents the implemented behavior.

## What Developers Do

You keep passing `onEvent` to SDK methods. The callback is invoked locally in your app while flows (registration, login, signing, device linking, account sync) execute inside the wallet iframe.

```ts
// Parent app code
await walletRouter.registerPasskey({
  nearAccountId,
  options: {
    onEvent: (ev) => {
      // ev is RegistrationSSEEvent
    }
  }
})
```

No functions cross `postMessage`; the SDK handles bridging for you.

## How It Works

1) Parent → Child (RPC without functions)
- Parent sends `PM_*` envelope; functions in `options` are stripped. Only serializable fields (e.g., `sticky`) are posted.

2) Child emits PROGRESS from its `onEvent`
- The wallet host wraps `TatchiPasskey` calls and translates `onEvent(ev)` into:
  `post({ type: 'PROGRESS', requestId, payload: ev })`.
- Payloads reuse existing event shapes: `RegistrationSSEEvent | LoginSSEvent | ActionSSEEvent | DeviceLinkingSSEEvent | SyncAccountSSEEvent`.

3) Parent bridges PROGRESS → onEvent
- For each request, the client registers an `onProgress` handler created via `wrapOnEvent(onEvent, isXxxSSEEvent)`.
- When a `PROGRESS` message arrives, the client:
  - correlates by `requestId`
  - routes through a small `OnEventsProgressBus`
  - invokes the stored `onProgress`, which safely narrows and forwards to your `onEvent`.

4) Completion
- Child posts `PM_RESULT` (success) or `ERROR` (failure). The pending entry resolves/rejects and, unless `sticky` is set, progress delivery is unregistered.

## Message Shapes (child → parent)

- PROGRESS: `{ type: 'PROGRESS', requestId: string, payload: { step: number, phase: string, status: 'progress'|'success'|'error', message?: string, data?: unknown } }`
- PM_RESULT: `{ type: 'PM_RESULT', requestId: string, payload: { ok: true, result: unknown } }`
- ERROR: `{ type: 'ERROR', requestId: string, payload: { code: string, message: string, details?: unknown } }`

Ordering is FIFO per `requestId`.

## Where The Bridging Lives (code)

- Host posts PROGRESS from `onEvent`:
  - `src/core/WalletIframe/host/wallet-iframe-host.ts`
    - e.g., handlers for `PM_REGISTER`, `PM_LOGIN`, `PM_SIGN_TXS_WITH_ACTIONS`, `PM_SIGN_AND_SEND_TXS`, device linking, account sync.
- Client receives PROGRESS and invokes app `onEvent` via wrapper:
  - `src/core/WalletIframe/client/router.ts`
    - `post()` registers `{ onProgress }` per request
    - `onPortMessage()` dispatches `PROGRESS` to `OnEventsProgressBus`
    - `wrapOnEvent(onEvent, isXxxSSEEvent)` narrows `ProgressPayload` before calling `onEvent`
- Message contracts:
  - `src/core/WalletIframe/shared/messages.ts` (`ProgressPayload`, PROGRESS/PM_RESULT/ERROR envelopes, `options.sticky`)

## Notes

- No functions ever cross the boundary; app callbacks run in the parent only.
- Timeouts are refreshed on each `PROGRESS` received.
- Type guards (`isRegistrationSSEEvent`, `isLoginSSEvent`, `isActionSSEEvent`, etc.) ensure your `onEvent` only receives the expected shape.
- Use `sticky` when a flow should keep receiving status after the main result (e.g., certain device‑linking screens).
