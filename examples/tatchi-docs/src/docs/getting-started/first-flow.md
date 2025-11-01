---
title: First Flow — Register, Login, Send
---

# First Flow — Register, Login, Send

Get a working passkey and send your first transaction.

## 1) Register a passkey

```tsx
import { usePasskeyContext } from '@tatchi-xyz/sdk/react'

export function Register({ accountId }: { accountId: string }) {
  const { registerPasskey } = usePasskeyContext()
  return (
    <button
      onClick={() =>
        registerPasskey(accountId, {
          onEvent: (e) => {
            if (e.step === 2 && e.status === 'success') {
              console.info('Login is now enabled')
            }
          },
        })
      }
    >
      Register Passkey
    </button>
  )
}
```

## 2) Login

```tsx
import { usePasskeyContext } from '@tatchi-xyz/sdk/react'

export function Login({ accountId }: { accountId: string }) {
  const { loginPasskey } = usePasskeyContext()
  return <button onClick={() => loginPasskey(accountId)}>Login</button>
}
```

Notes
- With a relay configured, login can unlock the VRF key via Shamir 3‑pass without TouchID; falls back automatically when needed.

## 3) Send a transaction

API‑driven

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

React button (optional)

```tsx
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react'

<SendTxButtonWithTooltip
  nearAccountId="alice.testnet"
  txSigningRequests={[
    { receiverId: 'contract.testnet', actions: [{ type: 'FunctionCall', methodName: 'set_greeting', args: { message: 'hi' }, gas: '50000000000000', deposit: '0' }] },
  ]}
/>
```

Next steps
- [Passkeys guide](/docs/guides/passkeys)
- [Secure Transaction Confirmation](/docs/guides/tx-confirmation)
- [Credential Scope (rpId)](/docs/concepts/wallet-scoped-credentials)

