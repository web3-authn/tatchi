Hooks contract (beforeCall, afterCall, onError)

- beforeCall
  - Type: `() => void | Promise<void>`
  - The SDK does not wrap this in try/catch. If it throws/rejects, the error bubbles to the caller and no `onError` or `afterCall(false, …)` is invoked by the SDK.

- onError
  - Type: `(error: Error) => void | Promise<void>`
  - Single channel for errors produced during the main operation (not `beforeCall`).

- afterCall
  - Type: `(success: boolean, result?: T) => void | Promise<void>`
  - Success path: `afterCall(true, result)` with a concrete result.
  - Failure path: `afterCall(false)` with no result. Errors are delivered via `onError(error)`.

Rationale

- Predictable and ergonomic: success carries a result; failures do not. Error details are delivered through `onError` only.
- No silent swallowing: user-provided `beforeCall`/`onError`/`afterCall` are not wrapped by the SDK; any thrown error in `afterCall` or `onError` bubbles.

Example

```ts
const hooks = {
  beforeCall: () => ui.start(),
  onError: (e: Error) => ui.error(e.message),
  afterCall: (success: boolean, result?: MyResult) => {
    if (success) ui.done(result!); else ui.done();
  }
};
```

