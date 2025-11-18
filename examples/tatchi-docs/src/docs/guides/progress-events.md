---
title: Progress Events (onEvent)
---

# Progress Events (onEvent)

The SDK streams structured progress events from long‑running flows (registration, login, and transactions) so you can drive your own loaders, toasts, and step indicators.

All of these flows share a common shape:

- `registerPasskey` / `registerPasskeyWithConfig`
- `loginPasskey`
- `executeAction`
- `signAndSendTransactions`
- `signTransactionsWithActions`

Each accepts an `onEvent` callback that receives an event discriminated by `step`, `phase`, and `status`.

```ts
type BaseEvent = {
  step: number
  phase: string
  status: 'progress' | 'success' | 'error'
  message: string
}
```

Below are the concrete events for each flow.

---

## Registration (`registerPasskey`)

```ts
import type { RegistrationSSEEvent } from '@tatchi-xyz/sdk/react'
```

Pass `onEvent` when calling `registerPasskey`:

```ts
registerPasskey(accountId, {
  onEvent: (event: RegistrationSSEEvent) => {
    console.log(event.step, event.phase, event.status, event.message)
  },
})
```

### Phases

- `webauthn-verification` – WebAuthn ceremony / PRF output
- `key-generation` – NEAR + VRF keys derived from PRF
- `contract-pre-check` – pre‑flight checks against the Web3Authn contract
- `access-key-addition` – account creation / access key add (via relay)
- `contract-registration` – VRF + WebAuthn registration on the contract
- `account-verification` – post‑commit on‑chain access key verification
- `database-storage` – encrypted key + metadata persisted locally
- `registration-complete` – registration + VRF session ready
- `error` – terminal failure requiring user action

### Steps

```ts
// step 1 – WebAuthn ceremony
step: 1, phase: 'webauthn-verification'

// step 2 – keys derived from PRF
step: 2, phase: 'key-generation'

// step 3 – contract pre‑check
step: 3, phase: 'contract-pre-check'

// step 4 – NEAR account / access key add
step: 4, phase: 'access-key-addition'

// step 5 – on‑chain registration
step: 5, phase: 'contract-registration'

// step 6 – verify access key on‑chain
step: 6, phase: 'account-verification'

// step 7 – local storage
step: 7, phase: 'database-storage'

// step 8 – registration complete
step: 8, phase: 'registration-complete'

// step 0 – terminal error
step: 0, phase: 'error'
```

**Practical usage:**

- You can safely **enable login** once you see `step === 2` with `status === 'success'`.
- Treat `step === 0` as “hard stop” and surface `event.error` to the user.

---

## Login (`loginPasskey`)

```ts
import type { LoginSSEvent } from '@tatchi-xyz/sdk/react'
```

```ts
loginPasskey(accountId, {
  onEvent: (event: LoginSSEvent) => {
    console.log(event.step, event.phase, event.status, event.message)
  },
})
```

### Phases

- `preparation` – client‑side checks before WebAuthn / Shamir flows
- `webauthn-assertion` – WebAuthn authentication ceremony
- `vrf-unlock` – VRF keypair decrypted into worker memory
- `login-complete` – login + VRF session ready
- `login-error` – terminal failure

### Steps

```ts
step: 1, phase: 'preparation'
step: 2, phase: 'webauthn-assertion'
step: 3, phase: 'vrf-unlock'
step: 4, phase: 'login-complete'  // success
step: 0, phase: 'login-error'     // error
```

---

## Transactions (`executeAction`, `signAndSendTransactions`, `signTransactionsWithActions`)

```ts
import type { ActionSSEEvent } from '@tatchi-xyz/sdk/react'
```

All transaction helpers accept `onEvent` in their options:

```ts
await passkeyManager.executeAction('alice.testnet', {
  type: 'FunctionCall',
  receiverId: 'contract.testnet',
  methodName: 'set_greeting',
  args: { message: 'hi' },
  gas: '50000000000000',
  deposit: '0',
}, {
  onEvent: (event: ActionSSEEvent) => {
    console.log(event.step, event.phase, event.status, event.message)
  },
})
```

or:

```ts
await passkeyManager.signAndSendTransactions({
  nearAccountId: 'alice.testnet',
  transactionInputs: [{ receiverId, actions }],
}, {
  onEvent: (event: ActionSSEEvent) => { /* … */ },
})
```

### Phases

- `preparation` – input validation, NonceManager pre‑warm
- `user-confirmation` – iframe modal visible, waiting for click
- `contract-verification` – VRF challenge + contract checks in worker
- `webauthn-authentication` – WebAuthn ceremony inside wallet origin
- `authentication-complete` – contract‑side auth finished
- `transaction-signing-progress` – WASM worker signing transactions
- `transaction-signing-complete` – signatures ready
- `broadcasting` – transaction(s) sent to NEAR RPC
- `action-complete` – final success event
- `wasm-error` / `action-error` – failure

### Steps

```ts
step: 1, phase: 'preparation'
step: 2, phase: 'user-confirmation'
step: 3, phase: 'contract-verification'
step: 4, phase: 'webauthn-authentication'
step: 5, phase: 'authentication-complete'
step: 6, phase: 'transaction-signing-progress'
step: 7, phase: 'transaction-signing-complete'
step: 8, phase: 'broadcasting'
step: 9, phase: 'action-complete'
step: 0, phase: 'action-error' | 'wasm-error'
```

**Typical UI mapping:**

- `step 1` → “Preparing transaction…”
- `step 2` → “Waiting for confirmation…” (keep iframe modal visible)
- `step 4–5` → “Authenticating with contract…”
- `step 6–7` → “Signing transaction…”
- `step 8` → “Broadcasting…”
- `step 9` → “Done!”

---

## End‑to‑end example

```tsx
import type {
  RegistrationSSEEvent,
  LoginSSEvent,
  ActionSSEEvent,
} from '@tatchi-xyz/sdk/react'

type AnyEvent = RegistrationSSEEvent | LoginSSEvent | ActionSSEEvent

function useProgressToasts() {
  const handleEvent = (event: AnyEvent) => {
    const { step, phase, status, message } = event

    if (status === 'error') {
      toast.error(message)
      return
    }

    if (status === 'success' && (step === 4 || step === 8 || step === 9)) {
      toast.success(message)
      return
    }

    toast.loading(message, { id: `${phase}-${step}` })
  }

  return { handleEvent }
}

// Usage
registerPasskey(accountId, {
  onEvent: (e) => handleEvent(e),
})

loginPasskey(accountId, {
  onEvent: (e) => handleEvent(e),
})

passkeyManager.executeAction(accountId, action, {
  onEvent: (e) => handleEvent(e),
})
```

