---
title: Next Steps
---

# Next Steps: Register, Login, Send

Now that you've finished [wallet installation](./installation), let's walk through the core flow: registering a passkey, logging in, and sending your first transaction.

The simplest way to get started is with a single component that registers a passkey-backed account:

## Register a Passkey Wallet

```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react'

export default function App() {
  return (
    <main>
      <Registration/>
    </main>
  )
}

function Registration() {
  const { registerPasskey } = useTatchi()
  return (
    <button onClick={() => {
      const id = Date.now();
      registerPasskey(`tatchi-test-${id}.${tatchi.configs.contractId}`, {
        onEvent: (event) => {
          console.log('registration event: ', event)
        }
      });
    }}>
      Register Account
    </button>
  )
}
```

Behind the scenes, this triggers a WebAuthn registration, derives a deterministic NEAR keypair from the credential, and stores everything you need in IndexedDB (the WebAuthn credential ID, NEAR public key, and encrypted VRF keypair). If you've configured a relay, it'll also store server-encrypted VRF material for smoother future logins.

## Login

Once you've registered an account, you can retrieve recent logins and let users authenticate:

```tsx
import { useState, useEffect } from 'react'
import { useTatchi } from '@tatchi-xyz/sdk/react'

function Login() {
  const { tatchi, loginState, loginAndCreateSession } = useTatchi()
  return (
    <>
      <button onClick={async () => {
          const { lastUsedAccount } = await tatchi.getRecentLogins();
          if (!lastUsedAccount?.nearAccountId) { return null; }
          loginAndCreateSession(lastUsedAccount.nearAccountId)
        }}
      >
        Log In
      </button>
      {loginState.isLoggedIn && (
        <>
          <button onClick={() => tatchi.logoutAndClearSession()}>
            Logout
          </button>
          <p>{JSON.stringify(loginState)}</p>
        </>
      )}
    </>
  )
}
```

When you call `loginAndCreateSession()`, the SDK establishes a VRF session and mints a warm signing session. If you've configured a relay, it can unlock the VRF key via Shamir 3-pass without prompting for TouchID. Otherwise it falls back to a biometric prompt to decrypt the VRF keypair. Once logged in, you're ready to sign transactions.

## Send Transaction

Once logged in (VRF key is unlocked) you can call `executeAction()` which takes your account ID, the receiver contract, and an array of actions (in this case, a function call).

```tsx
import { useState } from 'react'
import { useTatchi } from '@tatchi-xyz/sdk/react'
import { ActionType } from '@tatchi-xyz/sdk/core'

function Transactions() {
  const { tatchi, loginState } = useTatchi()
  const [tx, setTx] = useState(null);

  if (!loginState.isLoggedIn) return null;

  return (
    <>
      <button onClick={async () => {
        const result = await tatchi.executeAction({
          nearAccountId: loginState.nearAccountId,
          receiverId: tatchi.configs.contractId,
          actionArgs: [
            {
              type: ActionType.FunctionCall,
              methodName: 'set_greeting',
              args: { greeting: 'hello test tachi!' },
              gas: '30000000000000',
              deposit: '0',
            },
          ],
          options: {
            confirmationConfig: { behavior: 'requireClick' },
            onEvent: (event) => console.log(event),
            afterCall: (success, result) => {
              if (success) {
                setTx(result.result)
              }
            }
          },
        })
        setTx(result)
      }}>
        Send Transaction
      </button>
      {tx && <p>{JSON.stringify(tx)}</p>}
    </>
  )
}
```

You can set `confirmationConfig: { behavior: 'requireClick' | 'autoProceed' }` to  either force explicit user confirmation in the wallet UI or skip it.

The `onEvent()` callback streams progress events (authentication, signing, broadcasting, completion) that you can use to update your UI or handle errors.

When you're done, call `logoutAndClearSession()` to clear the in-memory VRF key and update `loginState` accordingly.


## Recap

**Registration**: `registerPasskey()` triggers WebAuthn registration, derives a deterministic NEAR keypair, encrypts and persists the data in IndexedDB. In iframe mode, this happens in the wallet origin for isolation.

**Login**: `getRecentLogins()` reads from IndexedDB and tracks the last-used account. `loginAndCreateSession()` unlocks the VRF key and ensures a warm signing session exists. With a relay server configured, you can unlock the VRF key automatically without biometrics, otherwise it uses TouchID to unlock (serverless). The VRF key is used to generate verifiable challenges for stateless Passkey authentication with the onchain webauthn contract.

*Logout*: `logoutAndClearSession()` clears the in-memory VRF key and updates loginState.

**Transactions**: `executeAction()` builds, signs, and broadcasts transactions to the NEAR blockchain. `onEvent` handlers stream progress events back for UI updates.

## Next steps

- [Set up other frameworks](./other-frameworks.md): Next.js, Vue, Svelte, Express
- [React Recipes](/docs/getting-started/react-recipes): convenience components for registration, login, and managing accounts.
- [API Reference](../api/index.md): export keys, recover accounts, link devices, batch sign/send
- [Concepts](../concepts/index.md): security model, VRF/PRF, architecture
  - [Architecture](../concepts/architecture.md)
  - [VRF challenges](../concepts/vrf-webauthn.md)
