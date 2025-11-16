---
title: React Components
---

# React Components

UI components and wrappers for embedding the Wallet Iframe UX.

Examples:

- `WalletIframeTxButtonHost`
- `LitHaloBorder` and related visuals

## Hooks contract (afterCall, onError)

Use a simple, predictable hook interface for async operations executed by components and helpers.

- `onError(error: Error)`: single channel for operation errors
- `afterCall(success: boolean, result?: T)`: success carries a result; failures do not

Example

```ts
const hooks = {
  onError: (e: Error) => ui.error(e.message),
  afterCall: (success: boolean, result?: MyResult) => {
    if (success) ui.done(result!); else ui.done();
  },
}
```
