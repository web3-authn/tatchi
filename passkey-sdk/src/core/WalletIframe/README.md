# WalletIframe Callback Chain

## Callback Chain for PasskeyManagerIframe Calls

The callback chain follows this flow:

### 1. **PasskeyManagerIframe** (Entry Point)
- Acts as a proxy/wrapper around the WalletIframeClient
- Handles hook callbacks (`beforeCall`, `afterCall`, `onError`, `onEvent`)
- For example, in `registerPasskey()`:
  ```typescript
  const res = await this.client.registerPasskey({
    nearAccountId,
    options: { onEvent: options?.onEvent }
  });
  ```

### 2. **WalletIframeClient** (Communication Layer)
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

1. **PasskeyManagerIframe** → calls **WalletIframeClient** method
2. **WalletIframeClient** → posts message to iframe via MessagePort
3. **wallet-iframe-host.ts** → receives message, executes PasskeyManager operation
4. **wallet-iframe-host.ts** → sends PROGRESS events during operation
5. **WalletIframeClient** → bridges PROGRESS events to caller's `onEvent` callback
6. **wallet-iframe-host.ts** → sends final result
7. **WalletIframeClient** → resolves promise with result
8. **PasskeyManagerIframe** → calls `afterCall` hook and returns result

## Progress Event Bridging:

The key insight is that progress events are bridged through the MessagePort:
- Host sends: `{ type: 'PROGRESS', requestId, payload: ev }`
- Client receives and calls: `pend?.onProgress?.((msg as any).payload)`
- This allows the original `onEvent` callback to receive real-time progress updates

So yes, your understanding is correct: **PasskeyManagerIframe → WalletIframeClient → posts to wallet-iframe-host.ts**, with the additional detail that progress events flow back through the same channel to provide real-time updates to the caller.
