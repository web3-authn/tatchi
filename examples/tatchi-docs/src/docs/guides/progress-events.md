---
title: Progress Events (onEvent)
---

# Progress Events (onEvent)

The SDK streams structured progress events from long‑running flows (registration, login, transactions, and device linking) so you can drive your own loaders, toasts, and step indicators.



## Registration walkthrough (from button to success)

This section focuses on **registration**, showing how to wire `registerPasskey` to your own UI using `onEvent`.

Prerequisites:

- App is wrapped in `TatchiPasskeyProvider` (see [Install and Wallet Setup](./wallet-iframe-integration.md)).
- Wallet iframe is configured and reachable.

### 1. Attach `onEvent` to `registerPasskey`

```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react'
import type { RegistrationSSEEvent } from '@tatchi-xyz/sdk/react'

export function RegisterWithProgress({ accountId }: { accountId: string }) {
  const { registerPasskey } = useTatchi()

  const handleEvent = (event: RegistrationSSEEvent) => {
    console.log('[registerPasskey]', event.step, event.phase, event.status, event.message)
    // Map event.message into your own toasts / banners / spinners
  }

  const handleClick = () => {
    registerPasskey(accountId, {
      onEvent: handleEvent,
      onError: (error) => {
        console.error('Registration failed:', error)
      },
    })
  }

  return (
    <button onClick={handleClick}>
      Register passkey
    </button>
  )
}
```

### 2. Drive UI from `step` and `status`

Registration events follow the shape documented below in [Registration (`registerPasskey`)](#registration-registerpasskey).
Common patterns:

- **Loading state** – disable the button while `status === 'progress'`.
- **Step labels** – map `step` → label:
  - `step 1` → “Creating passkey with TouchID…”
  - `step 4` → “Creating NEAR account / access key…”
  - `step 5–6` → “Verifying registration on‑chain…”
  - `step 7` → “Saving keys locally…”
  - `step 8` → “Registration complete!”
- **Error handling** – if `status === 'error'` (or `step === 0`), show `event.message` or `event.error` and offer a retry.

You can also combine registration events with transaction/login events using a shared handler like
[the end‑to‑end example](#end-to-end-example) at the bottom of this page.



All of these flows share a common shape:

- `registerPasskey`
- `loginAndCreateSession`
- `executeAction`
- `signAndSendTransactions`
- `signTransactionsWithActions`
- `startEmailRecovery` / `finalizeEmailRecovery`
- Device linking flows (`linkDeviceWithScannedQRData`, `useDeviceLinking`, `PasskeyAuthMenu` `linkDeviceOptions`, etc.)

Each accepts an `onEvent` callback that receives an event discriminated by `step`, `phase`, and `status`.

```ts
import {
  RegistrationPhase,
  LoginPhase,
  ActionPhase,
  DeviceLinkingPhase,
  EmailRecoveryPhase,
} from '@tatchi-xyz/sdk/react'

type BaseEvent = {
  step: number
  phase:
    | RegistrationPhase
    | LoginPhase
    | ActionPhase
    | DeviceLinkingPhase
    | EmailRecoveryPhase
  status: 'progress' | 'success' | 'error'
  message: string
}
```

Below are the concrete events for each flow.



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

### Timeline (step → phase)

- `STEP_1_WEBAUTHN_VERIFICATION` -> WebAuthn ceremony / PRF output.
- `STEP_2_KEY_GENERATION` -> NEAR + VRF keys derived from PRF.
- `STEP_3_CONTRACT_PRE_CHECK` -> pre‑flight checks against the Web3Authn contract.
- `STEP_4_ACCESS_KEY_ADDITION` -> account creation / access key add (via relay).
- `STEP_5_CONTRACT_REGISTRATION` -> VRF + WebAuthn registration on the contract.
- `STEP_6_ACCOUNT_VERIFICATION` -> post‑commit on‑chain access key verification.
- `STEP_7_THRESHOLD_KEY_ENROLLMENT` -> best‑effort threshold key activation result (if `threshold-signer`).
- `STEP_8_DATABASE_STORAGE` -> encrypted key + metadata persisted locally.
- `STEP_9_REGISTRATION_COMPLETE` -> registration + VRF session ready.
- `REGISTRATION_ERROR` -> terminal failure requiring user action.

**Practical usage:**

- You can safely **enable login** once you see `step === 2` with `status === 'success'`.
- Treat `step === 0` as “hard stop” and surface `event.error` to the user.



## Login (`loginAndCreateSession`)

```ts
import type { LoginSSEvent } from '@tatchi-xyz/sdk/react'
```

```ts
loginAndCreateSession(accountId, {
  onEvent: (event: LoginSSEvent) => {
    console.log(event.step, event.phase, event.status, event.message)
  },
})
```

### Timeline (step → phase)

- `STEP_1_PREPARATION` -> client‑side checks before WebAuthn / Shamir flows.
- `STEP_2_WEBAUTHN_ASSERTION` -> WebAuthn authentication ceremony.
- `STEP_3_VRF_UNLOCK` -> VRF keypair decrypted into worker memory.
- `STEP_4_LOGIN_COMPLETE` -> login + VRF session ready (success).
- `LOGIN_ERROR` -> terminal failure.



## Transactions (`executeAction`, `signAndSendTransactions`, `signTransactionsWithActions`)

```ts
import { ActionType } from '@tatchi-xyz/sdk/react'
import type { ActionSSEEvent } from '@tatchi-xyz/sdk/react'
```

All transaction helpers accept `onEvent` in their options:

```ts
await tatchi.executeAction({
  nearAccountId: 'alice.testnet',
  receiverId: 'contract.testnet',
  actionArgs: [
    {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { message: 'hi' },
      gas: '50000000000000',
      deposit: '0',
    },
  ],
  options: {
    onEvent: (event: ActionSSEEvent) => {
      console.log(event.step, event.phase, event.status, event.message)
    },
  },
})
```

or:

```ts
await tatchi.signAndSendTransactions({
  nearAccountId: 'alice.testnet',
  transactions: [{ receiverId, actions }],
}, {
  onEvent: (event: ActionSSEEvent) => { /* … */ },
})
```

### Timeline (step → phase)

- `STEP_1_PREPARATION` -> input validation, NonceManager pre‑warm.
- `STEP_2_USER_CONFIRMATION` -> iframe modal visible, waiting for click.
- `STEP_3_WEBAUTHN_AUTHENTICATION` -> WebAuthn ceremony inside wallet origin.
- `STEP_4_AUTHENTICATION_COMPLETE` -> contract‑side auth finished.
- `STEP_5_TRANSACTION_SIGNING_PROGRESS` -> WASM worker signing transactions.
- `STEP_6_TRANSACTION_SIGNING_COMPLETE` -> signatures ready.
- `STEP_7_BROADCASTING` -> transaction(s) sent to NEAR RPC.
- `STEP_8_ACTION_COMPLETE` -> final success event.
- `ACTION_ERROR` / `WASM_ERROR` -> failure.

**Typical UI mapping:**

- `step 1` → “Preparing transaction…”
- `step 2` → “Waiting for confirmation…” (keep iframe modal visible)
- `step 4–5` → “Authenticating with contract…”
- `step 6–7` → “Signing transaction…”
- `step 8` → “Broadcasting…”
- `step 9` → “Done!”



## Device Linking (`linkDeviceWithScannedQRData`, `useDeviceLinking`)

```ts
import type { DeviceLinkingSSEEvent } from '@tatchi-xyz/sdk/react'
```

Device linking events are emitted when you:

- Call low‑level APIs like `tatchi.linkDeviceWithScannedQRData(qrData, { onEvent })`
- Use the React hook `useDeviceLinking({ onEvent })`
- Wire `linkDeviceOptions.onEvent` into `PasskeyAuthMenu`
- Use `AccountMenuButton` with `deviceLinkingScannerParams.onEvent`

In all cases, the handler receives a `DeviceLinkingSSEEvent`:

```ts
const onLinkDeviceEvent = (event: DeviceLinkingSSEEvent) => {
  console.log(event.step, event.phase, event.status, event.message)
}
```

### Timeline (step → phase)

- `STEP_1_QR_CODE_GENERATED` -> QR shown on Device 2.
- `STEP_2_SCANNING` -> Device 1 scanning the QR.
- `STEP_3_AUTHORIZATION` -> Device 1 TouchID / biometrics.
- `STEP_4_POLLING` -> Device 2 polling contract for mapping.
- `STEP_5_ADDKEY_DETECTED` -> AddKey detected, starting registration.
- `STEP_6_REGISTRATION` -> deterministic keys + local storage on Device 2.
- `STEP_7_LINKING_COMPLETE` -> linking finished (status === 'success').
- `STEP_8_AUTO_LOGIN` -> optional auto-login after linking.
- `REGISTRATION_ERROR` / `LOGIN_ERROR` / `DEVICE_LINKING_ERROR` -> terminal error.

**Typical UI mapping:**

- `step 1` → “Show QR code and wait for scan…”
- `step 2–3` → “Scanning / approving on other device…”
- `step 4–5` → “Waiting for device mapping on‑chain…”
- `step 6` → “Storing authenticator on this device…”
- `step 7` → “Device linked successfully”
- `step 8` → “Logging in on this device…”



## Email Recovery (`startEmailRecovery`, `finalizeEmailRecovery`)

```ts
import type { EmailRecoverySSEEvent } from '@tatchi-xyz/sdk/react'
```

Email recovery events are emitted when you call:

- `tatchi.startEmailRecovery({ accountId, options: { onEvent } })`
- `tatchi.finalizeEmailRecovery({ accountId, nearPublicKey?, options: { onEvent } })`

### Timeline (step → phase)

- `STEP_1_PREPARATION` -> pre-checks and local setup.
- `STEP_2_TOUCH_ID_REGISTRATION` -> WebAuthn ceremony to derive the new device key.
- `STEP_3_AWAIT_EMAIL` -> waiting for the user to send the recovery email.
- `STEP_4_POLLING_VERIFICATION_RESULT` -> polling the EmailRecoverer attempt / access key status.
- `STEP_5_FINALIZING_REGISTRATION` -> submitting and finalizing the on-chain registration.
- `STEP_6_COMPLETE` -> email recovery complete (new device saved locally).
- `RESUMED_FROM_PENDING` (step `0`) -> `finalizeEmailRecovery()` resumed after a refresh/reload.
- `ERROR` (step `0`) -> terminal failure (restart the flow).

## End‑to‑end example

```tsx
import type {
  RegistrationSSEEvent,
  LoginSSEvent,
  ActionSSEEvent,
  DeviceLinkingSSEEvent,
  EmailRecoverySSEEvent,
} from '@tatchi-xyz/sdk/react'

type AnyEvent =
  | RegistrationSSEEvent
  | LoginSSEvent
  | ActionSSEEvent
  | DeviceLinkingSSEEvent
  | EmailRecoverySSEEvent

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

loginAndCreateSession(accountId, {
  onEvent: (e) => handleEvent(e),
})

await tatchi.executeAction({
  nearAccountId: accountId,
  receiverId,
  actionArgs,
  options: { onEvent: (e) => handleEvent(e) },
})
```
