# WalletIframe Callback Chain

## Callback Chain for PasskeyManagerIframe Calls

The callback chain follows this flow:

### 1. **PasskeyManagerIframe** (Entry Point)
- Acts as a proxy/wrapper around the WalletIframeRouter
- Handles hook callbacks (`beforeCall`, `afterCall`, `onError`, `onEvent`)
- For example, in `registerPasskey()`:
  ```typescript
  const res = await this.client.registerPasskey({
    nearAccountId,
    options: { onEvent: options?.onEvent }
  });
  ```

### 2. **WalletIframeRouter** (Communication Layer)
- Manages the iframe and MessagePort communication
- Posts messages to the iframe host via `this.post()` method
- Handles progress events by bridging them back to the caller's `onEvent` callback
- For example, in `registerPasskey()`:
  ```typescript
  const res = await this.post<any>(
    { type: 'PM_REGISTER', payload: { nearAccountId: payload.nearAccountId, options: safeOptions } },
    { onProgress: payload.options?.onEvent }
  );
  ```

### 3. **wallet-iframe-host.ts** (Service Host)
- Receives messages via MessagePort in `onPortMessage()`
- Creates and manages the actual PasskeyManager instance
- Executes the requested operations (like `passkeyManager!.registerPasskey()`)
- Sends progress events back via `post({ type: 'PROGRESS', requestId, payload: ev })`
- Returns results via `post({ type: 'PM_RESULT', requestId, payload: { ok: true, result } })`

## Key Communication Flow:

1. **PasskeyManagerIframe** → calls **WalletIframeRouter** method
2. **WalletIframeRouter** → posts message to iframe via MessagePort
3. **wallet-iframe-host.ts** → receives message, executes PasskeyManager operation
4. **wallet-iframe-host.ts** → sends PROGRESS events during operation
5. **WalletIframeRouter** → bridges PROGRESS events to caller's `onEvent` callback
6. **wallet-iframe-host.ts** → sends final result
7. **WalletIframeRouter** → resolves promise with result
8. **PasskeyManagerIframe** → calls `afterCall` hook and returns result

## Progress Event Bridging:

The key insight is that progress events are bridged through the MessagePort:
- Host sends: `{ type: 'PROGRESS', requestId, payload: ev }`
- Client receives and calls: `pend?.onProgress?.(msg.payload)`
- This allows the original `onEvent` callback to receive real-time progress updates

So yes, your understanding is correct: **PasskeyManagerIframe → WalletIframeRouter → posts to wallet-iframe-host.ts**, with the additional detail that progress events flow back through the same channel to provide real-time updates to the caller.

## Activation Overlay (iframe sizing behavior)

The wallet iframe mounts as an invisible 0×0 element and temporarily expands to a full‑screen overlay when user activation (e.g., TouchID/WebAuthn) is needed. This lets the wallet host collect credentials in the same browsing context while satisfying WebAuthn requirements.

- Initial mount (hidden):
  - `passkey-sdk/src/core/WalletIframe/IframeTransport.ts:66` sets `position: fixed; width: 0; height: 0; opacity: 0; pointer-events: none`.

- Expand to full‑screen during activation:
  - `passkey-sdk/src/core/WalletIframe/client.ts:654` `showFrameForActivation()` applies `width: 100vw; height: 100vh; pointer-events: auto; opacity: 1; zIndex: 2147483646`.
  - This is invoked explicitly around some flows (e.g., `registerPasskey()` at `passkey-sdk/src/core/WalletIframe/client.ts:224`, `loginPasskey()` at `passkey-sdk/src/core/WalletIframe/client.ts:252`, device1 linking at `passkey-sdk/src/core/WalletIframe/client.ts:454`) and implicitly by progress heuristics (below).

- Collapse back to 0×0:
  - `passkey-sdk/src/core/WalletIframe/client.ts:682` `hideFrameForActivation()` restores 0×0 and `pointer-events: none`.
  - The client always calls `hideFrameForActivation()` when a request completes (success or error) in `onPortMessage()` at `passkey-sdk/src/core/WalletIframe/client.ts:576`.

- When the overlay shows/hides automatically (heuristics):
  - `passkey-sdk/src/core/WalletIframe/progress-bus.ts:101` contains `defaultPhaseHeuristics` that decides when to show/hide based on `payload.phase` from PROGRESS events.
  - Behavior (tuned to minimize blocking time):
    - Show only for: `user-confirmation`, `webauthn-authentication`, `authorization`.
      - Important: `user-confirmation` must remain in the show list so the modal rendered inside the wallet iframe is visible and can capture a click when `behavior: 'requireClick'`.
    - Hide for: `authentication-complete`, `transaction-signing-progress`, `transaction-signing-complete`, `contract-verification`, `broadcasting`, `action-complete`, `registration`.

### Why the overlay may block clicks after sending

With the tuned heuristics, the overlay contracts immediately after TouchID completes (`authentication-complete`), even if subsequent phases (signing, broadcasting, waiting) continue. This minimizes the time the overlay blocks clicks.

### Options to adjust behavior

- Tweak heuristics to hide sooner:
  - The repo now hides on phases that indicate TouchID is done (e.g., `authentication-complete`) and when moving to non-interactive phases. Adjust further in `passkey-sdk/src/core/WalletIframe/progress-bus.ts:101` if needed.

- Emit a “completion” phase from the host:
  - Update host flows to post a PROGRESS with `phase: 'user-confirmation-complete'` as soon as WebAuthn finishes. The existing heuristic will then hide without further code changes.

- Last‑resort local control:
  - If needed for a specific integration, you can wrap calls with your own timing to ensure the overlay hides immediately after activation by invoking flows that don’t rely on the heuristic (e.g., those already calling `showFrameForActivation()` explicitly) and ensuring the host emits the completion phase promptly.

### Notes

- Layering: the iframe overlay uses `z-index: 2147483646`, kept one below the inner modal card (2147483647) to ensure the UI remains clickable when visible.
- Debugging: set `window.__W3A_DEBUG__ = true` (or pass `debug: true` to the client) to log overlay/phase routing decisions from the progress bus.
