---
title: Next Steps (Getting Started continued)
---

# Next Steps: Register, Login, Send

Now that you've got the SDK installed, let's walk through the core flow: registering a passkey, logging in, and sending your first transaction.

The simplest way to get started is with a single component that registers a passkey-backed account:

## 1. Register a passkey

```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react'

export function Register({ accountId }: { accountId: string }) {
  const { registerPasskey } = useTatchi()
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

Behind the scenes, this triggers a WebAuthn registration, derives a deterministic NEAR keypair from the credential, and stores everything you need in IndexedDB (the WebAuthn credential ID, NEAR public key, and encrypted VRF keypair). If you've configured a relay, it'll also store server-encrypted VRF material for smoother future logins.

## 2. Login

Once you've registered at least one account, you can retrieve recent logins and let users authenticate:

```tsx
import { useState, useEffect } from 'react'
import { useTatchi } from '@tatchi-xyz/sdk/react'

function App() {
  const { tatchi, loginState } = useTatchi()

  const [registrationState, setRegistrationState] = useState(null)
  const [account, setAccount] = useState(null)

  useEffect(() => {
    (async () => {
      const users = await tatchi.getRecentLogins()
      setAccount(users.lastUsedAccount)
    })()
  }, [tatchi])

  return (
    <main>
      <h1>Tatchi Example</h1>
      <button
        onClick={() => {
          const id = Date.now()
          tatchi.registerPasskey(`tatchi-test-${id}.${tatchi.configs.contractId}`, {
            onEvent: (event) => setRegistrationState(event)
          })
        }}
      >
        Register Tatchi Account
      </button>
      <p>{registrationState && JSON.stringify(registrationState)}</p>

      <button
        onClick={() => {
          if (account?.nearAccountId) {
            tatchi.loginPasskey(account.nearAccountId)
          }
        }}
      >
        Login
      </button>
      <p>
        {JSON.stringify(account)}
        {loginState.isLoggedIn && JSON.stringify(loginState)}
      </p>
    </main>
  )
}

export default App
```

When you call `loginPasskey()`, the SDK establishes a VRF session. If you've configured a relay, it can unlock the VRF key via Shamir 3-pass without prompting for TouchID. Otherwise it falls back to a biometric prompt to decrypt the VRF keypair. Once logged in, you're ready to sign transactions.

## 3. Send a transaction

```tsx
import { useState, useEffect } from 'react'
import { useTatchi } from '@tatchi-xyz/sdk/react'
import { ActionType } from '@tatchi-xyz/sdk/core'

function App() {
  const { tatchi, loginState } = useTatchi()

  const [registrationState, setRegistrationState] = useState(null)
  const [account, setAccount] = useState(null)
  const [tx, setTx] = useState(null)

  useEffect(() => {
    (async () => {
      const users = await tatchi.getRecentLogins()
      setAccount(users.lastUsedAccount)
    })()
  }, [tatchi])

  return (
    <main>
      <h1>Tatchi Demo</h1>
      <button
        onClick={() => {
          const id = Date.now()
          tatchi.registerPasskey(`tatchi-test-${id}.${tatchi.configs.contractId}`, {
            onEvent: (event) => setRegistrationState(event)
          })
        }}
      >
        Register Tatchi Account
      </button>
      <p>{registrationState && JSON.stringify(registrationState)}</p>

      <button
        onClick={() => {
          if (account?.nearAccountId) {
            tatchi.loginPasskey(account.nearAccountId)
          }
        }}
      >
        Login
      </button>
      <p>
        {JSON.stringify(account)}
        {loginState.isLoggedIn && JSON.stringify(loginState)}
      </p>

      {loginState.isLoggedIn && (
        <>
          <button
            onClick={async () => {
              const result = await tatchi.executeAction({
                nearAccountId: account.nearAccountId,
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
                  onEvent: (event) => {
                    console.log(event)
                  },
                },
              })
              setTx(result)
            }}
          >
            Send Transaction
          </button>
          <button onClick={() => tatchi.logoutAndClearVrfSession()}>
            Logout
          </button>
          {tx && JSON.stringify(tx)}
        </>
      )}
    </main>
  )
}

export default App
```

The `executeAction()` call takes your account ID, the receiver contract, and an array of actions (in this case, a function call).
You can set `confirmationConfig: { behavior: 'requireClick' | 'autoProceed' }` to  either force explicit user confirmation in the wallet UI or skip it.

The `onEvent()` callback streams progress events (authentication, signing, broadcasting, completion) that you can use to update your UI or handle errors.

When you're done, call `logoutAndClearVrfSession()` to clear the in-memory VRF key and update `loginState` accordingly.


## Recap

*Registration*: registerPasskey() triggers WebAuthn registration, derives a deterministic NEAR keypair, and persists everything in IndexedDB. In iframe mode, this happens in the wallet origin for isolation.

*Login*: getRecentLogins() reads from IndexedDB and tracks the last-used account.  loginPasskey() establishes a VRF session. With a relay, Shamir 3-pass unlocks the VRF keypair without biometrics; otherwise it uses TouchID to unlock.

*Transactions*: executeAction() constructs, signs, and broadcasts to NEAR. Progress events stream back for UI updates.

*Logout*: logoutAndClearVrfSession() clears the in-memory VRF key and updates loginState.

## Next steps

- Other frameworks (Next.js, Vue, Svelte, Express): ./other-frameworks
- API Reference (export keys, recover accounts, link devices, batch sign/send): ../api/index
  - Passkey Manager details: ../api/passkey-manager
- Concepts (security model, VRF/PRF, wallet iframe architecture): ../concepts/index
  - VRF challenges: ../concepts/vrf-challenges
  - Wallet iframe architecture: ../concepts/wallet-iframe-architecture
