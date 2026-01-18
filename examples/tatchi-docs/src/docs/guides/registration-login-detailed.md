---
title: Registration (Detailed)
---

# Registration (Detailed)

This guide explains the registration flow in depth: what `registerPasskey` does, how it uses the wallet iframe and VRF workers, and how to wire progress events into your own UI.

For a high‑level overview, see:

- [Architecture](/docs/concepts/architecture#registration-flow)
- [Progress Events](/docs/guides/progress-events#registration-registerpasskey)


## 1. What registration does

When you call `registerPasskey`, the SDK:

1. Opens the wallet iframe on the wallet origin.
2. Runs a WebAuthn registration ceremony (with PRF) inside that origin.
3. Derives deterministic keys from the PRF outputs:
   - A NEAR ed25519 keypair used as the account key.
   - A VRF keypair used for challenge generation.
4. Registers the passkey and VRF key on the Web3Authn contract.
5. Stores encrypted key material in the wallet’s IndexedDB (origin‑scoped).

All of that happens with **a single biometric prompt** for the user.

On the wire, the flow is:

- App → wallet iframe: `registerPasskey(accountId, options)`
- Wallet iframe → workers: WebAuthn + VRF + NEAR operations
- Wallet iframe → app: progress events + final result


## 2. Basic registration call (React)

```tsx
import {
  useTatchi,
  type RegistrationSSEEvent,
} from '@tatchi-xyz/sdk/react'

export function RegisterButton({ accountId }: { accountId: string }) {
  const { registerPasskey } = useTatchi()

  const handleEvent = (event: RegistrationSSEEvent) => {
    console.log('[registerPasskey]', event.step, event.phase, event.status, event.message)
  }

  const handleClick = () => {
    registerPasskey(accountId, {
      onEvent: handleEvent,
      onError: (error) => {
        console.error('Registration failed:', error)
      },
      confirmationConfig: {
        uiMode: 'modal',          // 'modal' | 'drawer'
        behavior: 'requireClick', // 'requireClick' | 'autoProceed'
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

Key options:

- `onEvent` – receive structured progress events during the flow.
- `onError` – per‑call error handler for unexpected failures.
- `confirmationConfig` – override confirmation UI (modal vs drawer, auto‑proceed vs explicit click).


## 3. Registration phases (what each step does)

Registration progress events use `RegistrationPhase` and `RegistrationStatus` enums (exported from `@tatchi-xyz/sdk/react`):

- `STEP_1_WEBAUTHN_VERIFICATION` -> WebAuthn ceremony / PRF output.
- `STEP_2_KEY_GENERATION` -> deterministic NEAR + VRF key derivation from PRF.
- `STEP_3_CONTRACT_PRE_CHECK` -> pre‑flight checks against the Web3Authn contract (e.g. account availability).
- `STEP_4_ACCESS_KEY_ADDITION` -> NEAR account creation / access key add (via relay server if configured).
- `STEP_5_CONTRACT_REGISTRATION` -> passkey + VRF registration on the contract.
- `STEP_6_ACCOUNT_VERIFICATION` -> post‑commit on‑chain access key verification.
- `STEP_7_THRESHOLD_KEY_ENROLLMENT` -> best‑effort threshold key activation result (if `threshold-signer`).
- `STEP_8_DATABASE_STORAGE` -> encrypted key + metadata persisted locally in wallet IndexedDB.
- `STEP_9_REGISTRATION_COMPLETE` -> registration + VRF session ready.
- `REGISTRATION_ERROR` -> terminal failure requiring user action.

`status` is one of:

- `progress` – phase is in progress.
- `success` – phase finished successfully.
- `error` – phase failed; inspect `event.error` for details.

Practical rules of thumb:

- Treat `STEP_2_KEY_GENERATION` + `status === 'success'` as “safe to enable login buttons”.
- Treat any `REGISTRATION_ERROR` as a hard stop; show the message and suggest retry.


## 4. Mapping events to UI

Typical UI wiring:

- **Disable registration button** when you see the first `progress` event, until the flow completes.
- **Show step labels** based on `phase`:
  - `STEP_1_WEBAUTHN_VERIFICATION` -> “Creating passkey with TouchID…”
  - `STEP_4_ACCESS_KEY_ADDITION` -> “Creating NEAR account / access key…”
  - `STEP_5_CONTRACT_REGISTRATION` / `STEP_6_ACCOUNT_VERIFICATION` -> “Verifying registration on‑chain…”
  - `STEP_8_DATABASE_STORAGE` -> “Saving keys locally…”
  - `STEP_9_REGISTRATION_COMPLETE` -> “Registration complete!”
- **Show toast notifications** using a shared handler (see [Progress Events](/docs/guides/progress-events#end-to-end-example)).

Example shared handler:

```ts
function handleRegistrationEvent(event: RegistrationSSEEvent) {
  const { step, phase, status, message } = event

  if (status === 'error') {
    toast.error(message)
    return
  }

  if (status === 'success' && phase === 'registration-complete') {
    toast.success(message || 'Registration complete')
    return
  }

  toast.loading(message, { id: `${phase}-${step}` })
}
```


## 5. Registration, relayer, and contracts

Depending on your configuration:

- **With a relay server**:
  - `STEP_4_ACCESS_KEY_ADDITION` performs account creation or access‑key addition via the relay.
  - The relay signs a transaction that creates the NEAR account and sets the passkey‑derived key.
- **Without a relayer**:
  - Use an existing NEAR account; registration will attach the WebAuthn/VRF binding to that account.

In both cases, the on‑chain contract:

1. Verifies the VRF proof.
2. Verifies the WebAuthn registration response.
3. Stores the passkey and (optionally) VRF public key.

For more details on the contract side, see:

- [Architecture – Registration Flow](/docs/concepts/architecture#registration-flow)
- [VRF WebAuthn](/docs/concepts/vrf-webauthn)


## 6. Where to go next

- For the full set of events across registration, login, transactions, and device linking, see [Progress Events](/docs/guides/progress-events).
- To wire registration into a full UI menu alongside login and account sync, see [React Recipes](/docs/getting-started/react-recipes) and `PasskeyAuthMenu`.
- For deployment and credential scope considerations, see:
  - [Passkey Scope](/docs/concepts/passkey-scope)
  - [Security Model](/docs/concepts/security-model)
