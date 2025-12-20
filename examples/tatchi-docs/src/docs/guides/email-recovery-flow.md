---
title: Email Recovery (Passkey + Email)
---

# Email Recovery (Passkey + Email)

Email recovery lets a user recover an existing NEAR account by:

1. Deriving a new deterministic device key from a passkey (TouchID/FaceID).
2. Sending a recovery email that your email recovery pipeline verifies.
3. Finalizing on-chain registration and storing the new device locally.

This guide documents the SDK surface (`startEmailRecovery` / `finalizeEmailRecovery`) and required configuration.

## Prerequisites

- The account already has a recovery email registered (the address the user must send from).
- The account has enough NEAR to pay for the finalization transaction (`minBalanceYocto` is checked before prompting).
- Your chain setup includes an email verification contract that exposes a `get_verification_result(request_id)`-style view.

## Configure Email Recovery

Configure `relayer.emailRecovery` in your SDK config:

```tsx
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

export function AppShell() {
  return (
    <TatchiPasskeyProvider
      config={{
        ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
        relayer: {
          ...PASSKEY_MANAGER_DEFAULT_CONFIGS.relayer,
          emailRecovery: {
            ...PASSKEY_MANAGER_DEFAULT_CONFIGS.relayer.emailRecovery,
            // Inbox that receives recovery emails (mailto "to")
            mailtoAddress: 'recover@yourdomain.com',
            // Contract that stores verification results keyed by request_id
            dkimVerifierAccountId: 'email-dkim-verifier-v1.testnet',
            // Optional: defaults to 'get_verification_result'
            // verificationViewMethod: 'get_verification_result',
          },
        },
      }}
    >
      {/* ... */}
    </TatchiPasskeyProvider>
  )
}
```

## Relayer Integration

The relayer exposes `POST /recover-email` (see [Relay Server Deployment](./relay-server-deployment)). It accepts a `ForwardableEmailPayload` containing the full raw RFC822 email (`raw`) and parsed `headers` (must include `subject`).

### Encrypted TEE Recovery

Encrypted email recovery lets the relayer submit DKIM verification without putting plaintext email on-chain. The relayer encrypts the raw RFC822 email to the Outlayer TEE public key and calls the per-account `EmailRecoverer` contract.

The verification contract stores a `VerificationResult` keyed by `request_id`, which the frontend polls via `get_verification_result(request_id)`.

Route usage:

- `POST /recover-email`
- Optional mode override: JSON `explicitMode` / `explicit_mode` or header `x-email-recovery-mode`
- Defaults to `tee-encrypted` when no mode is provided

Direct SDK usage:

```ts
import { AuthService } from '@tatchi-xyz/sdk/server'

const service = new AuthService({ /* relayer config */ })

const result = await service.emailRecovery?.verifyEncryptedEmailAndRecover({
  accountId: 'alice.testnet',
  emailBlob: rawEmailRfc822,
})
```

### ZK-Email Recovery

zk-email recovery uses a prover server to generate a proof from the raw RFC822 email, then submits the proof to the per-account recovery contract.

Prover API:

- `GET /healthz` -> `{ "status": "ok" }`
- `POST /prove-email` with `{ "rawEmail": "<full RFC822 email>" }` -> `{ proof, publicSignals }`

Health checks:

- The SDK performs a lightweight `/healthz` check before `/prove-email` by default.
- You can disable or tune this via `zkEmailProver.healthCheck` in the relayer config.

AuthService config:

```ts
import { AuthService } from '@tatchi-xyz/sdk/server'

const service = new AuthService({
  /* relayer config */
  zkEmailProver: { baseUrl: 'http://127.0.0.1:5588', timeoutMs: 60_000 },
})
```

To force zk-email on the route:

- JSON: `explicitMode: "zk-email"` (or `explicit_mode`)
- Header: `x-email-recovery-mode: zk-email`

The relayer can also infer mode from the first non-empty body line (`zk-email`, `tee-encrypted`, `onchain-public`), but explicit mode is recommended for programmatic callers.

Async mode (avoid prover timeouts):

- Header: `Prefer: respond-async` (or query `?async=1`)
- Response: `202` with `{ "success": true, "queued": true, "accountId": "..." }`

## Client Flow

`startEmailRecovery` creates the new device key and returns a `mailto:` URL. `finalizeEmailRecovery` polls for on-chain verification completion and finalizes registration.

```ts
const { mailtoUrl, nearPublicKey } = await tatchi.startEmailRecovery({
  accountId: 'alice.testnet',
  recoveryEmail: 'alice@gmail.com', // the address the user will send FROM
  options: { onEvent: (ev) => console.log(ev) },
})

window.open(mailtoUrl, '_blank', 'noopener,noreferrer')

await tatchi.finalizeEmailRecovery({
  accountId: 'alice.testnet',
  nearPublicKey, // optional if you are resuming from pending state
  options: { onEvent: (ev) => console.log(ev) },
})
```

### Email Subject Format

The SDK generates:

`recover-<REQUEST_ID> <ACCOUNT_ID> <NEW_PUBLIC_KEY>`

Example:

`recover-AB12CD alice.testnet ed25519:...`

## Resume and Retry

- Pending recovery state is stored in IndexedDB; after a reload you can call `finalizeEmailRecovery({ accountId })` to resume.
- If verification fails (wrong sender, DKIM failure, malformed subject), restart the flow with `startEmailRecovery`.

## Tracking requestId

The SDK generates a short `requestId` and embeds it in the email subject. It is also included in progress events so you can correlate UI state with relayer and contract logs:

```ts
await tatchi.startEmailRecovery({
  accountId,
  recoveryEmail,
  options: {
    onEvent: (ev) => {
      if (ev?.data && 'requestId' in ev.data) {
        console.log('email recovery requestId', ev.data.requestId)
      }
    },
  },
})
```
