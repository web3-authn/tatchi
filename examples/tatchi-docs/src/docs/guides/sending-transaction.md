---
title: Sending Transactions
---

# Sending Transactions

Use the passkey wallet to sign and send NEAR transactions with iframe‑hosted confirmation UI. This guide focuses on configuration options and hooks for transaction flows.

---

## 1. APIs for sending transactions

The main helpers exposed via `usePasskeyManager`:

- `executeAction` – sign and send a single transaction (most common).
- `signAndSendTransactions` – sign and send multiple transactions.
- `signTransactionsWithActions` – sign only (no broadcast).

```tsx
import { usePasskeyManager } from '@tatchi-xyz/sdk/react'
import { ActionType } from '@tatchi-xyz/sdk'

function SendGreeting() {
  const passkeyManager = usePasskeyManager()

  const handleClick = async () => {
    await passkeyManager.executeAction('alice.testnet', {
      type: ActionType.FunctionCall,
      receiverId: 'contract.testnet',
      methodName: 'set_greeting',
      args: { message: 'hello' },
      gas: '50000000000000',
      deposit: '0',
    }, {
      // hooks & options go here
    })
  }

  return <button onClick={handleClick}>Set greeting</button>
}
```

---

## 2. Confirmation configuration

Confirmation behavior is controlled by `ConfirmationConfig`. You can:

- Set **global preferences** (per user) via the profile UI and persistence.
- Override **per call** via `confirmationConfig` in hooks options.

### Per‑call override

```ts
await passkeyManager.executeAction('alice.testnet', action, {
  confirmationConfig: {
    uiMode: 'drawer',          // 'modal' | 'drawer'
    behavior: 'requireClick',  // 'requireClick' | 'autoProceed'
  },
})
```

- `uiMode`: choose between a centered modal or a bottom drawer.
- `behavior`:
  - `requireClick` – user must click “Confirm” (recommended).
  - `autoProceed` – auto‑confirm after a brief display (for low‑risk flows).

Global settings live in the wallet iframe and are respected when `confirmationConfig` is omitted.

---

## 3. Progress & result hooks

All transaction helpers accept the same family of hooks via options:

```ts
type ActionHooksOptions = {
  onEvent?: (event: ActionSSEEvent) => void
  onError?: (error: Error) => void
  afterCall?: (success: boolean, result?: ActionResult) => void
  waitUntil?: TxExecutionStatus
  confirmationConfig?: Partial<ConfirmationConfig>
}
```

### `onEvent` – progress events

Use this to drive spinners, step indicators, and logs.

```ts
import type { ActionSSEEvent } from '@tatchi-xyz/sdk/react'

const options = {
  onEvent: (event: ActionSSEEvent) => {
    console.log(event.step, event.phase, event.status, event.message)
  },
}
```

See [Progress Events](./progress-events.md) for the full step/phase matrix.

### `onError` – per‑call error handler

```ts
const options = {
  onError: (error: Error) => {
    console.error('Transaction failed:', error)
    toast.error(error.message)
  },
}
```

Errors are still thrown from the helper; use `onError` when you want both a side‑effect and a thrown error.

### `afterCall` – final outcome

```ts
const options = {
  afterCall: (success, result) => {
    if (!success) return
    console.log('Tx complete:', result?.transactionId)
  },
}
```

`afterCall` always runs once per call (success or failure) and is ideal for logging, analytics, or refreshing local state.

### `waitUntil` – execution status

Control how long to wait for chain execution:

```ts
import { TxExecutionStatus } from '@near-js/types'

await passkeyManager.executeAction('alice.testnet', action, {
  waitUntil: TxExecutionStatus.FINAL,   // default: wait for FINAL
})
```

For multi‑transaction flows, use `executionWait` with `signAndSendTransactions` (see below).

---

## 4. Multiple transactions (`signAndSendTransactions`)

Use `signAndSendTransactions` to sign and broadcast multiple transactions, with control over sequencing:

```ts
await passkeyManager.signAndSendTransactions({
  nearAccountId: 'alice.testnet',
  transactionInputs: [
    { receiverId: 'staking.testnet', actions: [stakeAction] },
    { receiverId: 'usdc.testnet', actions: [transferAction] },
  ],
}, {
  onEvent: (event) => console.log(event),
  executionWait: {
    mode: 'parallelStaggered',
    staggerMs: 100, // small delay between broadcasts
  },
})
```

`executionWait` supports:

- `{ mode: 'sequential'; waitUntil?: TxExecutionStatus }`
- `{ mode: 'parallelStaggered'; staggerMs: number }`

---

## 5. Sign‑only flows (`signTransactionsWithActions`)

If you need to sign transactions and broadcast them yourself, use `signTransactionsWithActions`:

```ts
const signed = await passkeyManager.signTransactionsWithActions({
  nearAccountId: 'alice.testnet',
  transactionInputs: [{ receiverId, actions }],
}, {
  onEvent: (event) => console.log('[signOnly]', event),
})

// signed[0].signedTransaction → send via your own RPC client
```

This uses the same `confirmationConfig`, `onEvent`, and `onError` semantics, but leaves broadcasting to you.

---

## 6. React button component

`SendTxButtonWithTooltip` wraps `executeAction` with a pre‑built button + tooltip UI:

```tsx
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react'
import { ActionType } from '@tatchi-xyz/sdk'

<SendTxButtonWithTooltip
  nearAccountId="alice.testnet"
  txSigningRequests={[
    {
      receiverId: 'token.testnet',
      actions: [{
        type: ActionType.FunctionCall,
        methodName: 'ft_transfer',
        args: { receiver_id: 'bob.testnet', amount: '1000000000000000000' },
        gas: '50000000000000',
        deposit: '1',
      }],
    },
  ]}
  options={{
    onEvent: (event) => console.log('[button]', event),
    onError: (error) => console.error(error),
    afterCall: (success, result) => {
      if (success) console.log('Tx hash:', result?.transactionId)
    },
    confirmationConfig: {
      uiMode: 'drawer',
      behavior: 'requireClick',
    },
  }}
>
  Send Token
</SendTxButtonWithTooltip>
```

If you pass both a top‑level `onEvent` prop and `options.onEvent`, the component prioritizes the top‑level prop; `options.onEvent` is ignored.

---

## 7. Troubleshooting

- **Modal not showing** – ensure the wallet iframe is mounted, `walletOrigin` is reachable, and the overlay isn’t hidden by your app CSS.
- **WebAuthn errors** – confirm `Permissions-Policy` delegates WebAuthn to the wallet origin and both origins use HTTPS.
- **Nonce issues** – the SDK manages nonces internally; avoid manual nonce handling and see [Nonce Manager](/docs/guides/nonce-manager.md) for details.

For additional error patterns and examples, see [Progress Events](./progress-events.md) and the SDK troubleshooting docs.

