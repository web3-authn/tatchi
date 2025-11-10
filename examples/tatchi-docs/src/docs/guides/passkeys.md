---
title: Passkeys (WebAuthn)
---

# Passkeys (WebAuthn)

Register and authenticate users with platform passkeys. The SDK unifies WebAuthn + NEAR flows and runs sensitive crypto in workers.

## Register

```tsx
import { usePasskeyContext } from '@tatchi-xyz/sdk/react'

export function Register({ accountId }: { accountId: string }) {
  const { registerPasskey } = usePasskeyContext()
  return (
    <button
      onClick={() =>
        registerPasskey(accountId, {
          onEvent: (e) => {
            // Step 2 = user-ready → account can login
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

Key steps emitted by the SDK (abridged):

- 1 `webauthn-verification`: Verify WebAuthn attestation/PRF
- 2 `key-generation`: Keys derived; login can be enabled
- 3 `contract-pre-check`: Lightweight contract/account checks
- 4 `access-key-addition`: Create NEAR account / add key (relay)
- 5 `contract-registration`: Register on contract (relay)
- 6 `account-verification`: Post-commit on-chain key check
- 7 `database-storage`: Store authenticator metadata
- 8 `registration-complete`: Done

## Login

```tsx
import { usePasskeyContext } from '@tatchi-xyz/sdk/react'

export function Login({ accountId }: { accountId: string }) {
  const { loginPasskey } = usePasskeyContext()
  return <button onClick={() => loginPasskey(accountId)}>Login</button>
}
```

When a relay server is configured, login can auto‑unlock the VRF keypair via the Shamir 3‑pass flow (no TouchID) and refresh to the current server key in the background. If it fails, the SDK falls back to TouchID and refreshes the stored blob.

## Use the Credential (transactions)

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

## Notes

- PRF outputs are used to deterministically derive NEAR keys and encrypt private keys in IndexedDB.
- All signing happens in a WASM worker; private keys never touch the main thread.
- For cross‑origin embedding and consistent credential lists across subdomains, see [Wallet‑Scoped vs App‑Scoped](../concepts/wallet-scoped-credentials).

Related reading:
- [Transaction Confirmation](./tx-confirmation)
- [Wallet Iframe](./wallet-iframe)
