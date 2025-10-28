---
title: Secure Transaction Confirmation
---

# Secure Transaction Confirmation

Request a focused, user‑presence confirmation for any transaction batch. The SDK renders the confirmation UI inside the wallet iframe and signs in a WASM worker.

## User settings

```ts
// Per-user preferences (persisted in IndexedDB)
passkeyManager.setPreConfirmFlow(true) // enable confirm flow
passkeyManager.setConfirmBehavior('requireClick') // or 'autoProceed'
```

## Automatic confirmation (API‑driven)

```ts
const result = await passkeyManager.executeAction('alice.testnet', {
  type: 'FunctionCall',
  receiverId: 'contract.testnet',
  methodName: 'set_greeting',
  args: { message: 'hello' },
  gas: '50000000000000',
  deposit: '0',
})
```

## Embedded button (React)

```tsx
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react'

<SendTxButtonWithTooltip
  nearAccountId="alice.testnet"
  txSigningRequests={[
    {
      receiverId: WEBAUTHN_CONTRACT_ID,
      actions: [
        createEmbeddedGreetingAction(),
        {
          type: ActionType.Transfer,
          amount: '100000000000000000000',
        },
      ],
    },
    {
      receiverId: WEBAUTHN_CONTRACT_ID,
      actions: [
        {
          type: ActionType.Transfer,
          amount: '200000000000000000000',
        },
      ],
    },
  ]}
  options={{
    beforeCall: () => {},
    afterCall: (success, result) => {},
    onError: (error: any) => {},
  }}
/>
```

Props include `nearAccountId`, `actionArgs`, styling (`buttonStyle`, `tooltipStyle`), and callbacks (`onSuccess`, `onError`, `onCancel`).

## Heuristics

During `STEP_2_USER_CONFIRMATION`, the wallet overlay expands to ensure the modal is visible and can capture the click. If you customize progress visibility, keep this step shown.

See also: [Transaction confirmation guide (SDK docs)](https://github.com/web3-authn/sdk/blob/main/sdk/docs/transaction_confirmation_guide.md)
