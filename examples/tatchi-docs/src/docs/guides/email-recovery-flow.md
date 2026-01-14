---
title: Email Recovery (Passkey + Email)
---

# Email Recovery (Passkey + Email)

Email recovery lets a user recover an existing NEAR account by:

1. Deriving a new deterministic device key from a passkey (TouchID/FaceID).
2. Sending a recovery email that your email recovery pipeline verifies.
3. Finalizing on-chain registration and storing the new device locally.

This guide documents the SDK surface (`setRecoveryEmails`, `getRecoveryEmails`, `startEmailRecovery`, `finalizeEmailRecovery`) and required configuration.

## Prerequisites

- The account already has at least one recovery email configured on-chain (the email address the user must send from).
- The account has enough NEAR to pay for the finalization transaction (`minBalanceYocto` is checked before prompting).
- Your account is using the EmailRecoverer contract (local or global) and exposes `get_recovery_attempt(request_id)` for polling recovery status (the SDK can attach it automatically when setting recovery emails).

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
          },
        },
      }}
    >
      {/* ... */}
    </TatchiPasskeyProvider>
  )
}
```

## Configure Recovery Emails (One-time Setup)

Email recovery requires the account to have a recovery email list on-chain. You typically do this while the user is already logged in on an existing device.

```ts
// Adds/updates the recovery email list on-chain (and stores a local mapping in IndexedDB).
await tatchi.setRecoveryEmails('alice.testnet', ['alice@gmail.com'], {
  onEvent: (ev) => console.log('setRecoveryEmails', ev),
});
```

You can display the currently configured recovery emails (best-effort: known emails are shown when this device has the local mapping; otherwise the hash is shown):

```ts
const recoveryEmails = await tatchi.getRecoveryEmails('alice.testnet');
console.log(recoveryEmails); // [{ hashHex, email }]
```

## Relayer Integration

The relayer exposes `POST /recover-email` (see [Relay Server Deployment](./relay-server-deployment)). It accepts a `ForwardableEmailPayload` containing the full raw RFC822 email (`raw`) and parsed `headers` (must include `subject`).

### Encrypted TEE Recovery

Encrypted email recovery lets the relayer submit DKIM verification without putting plaintext email on-chain. The relayer encrypts the raw RFC822 email to the Outlayer TEE public key and calls the per-account `EmailRecoverer` contract.

The per-account `EmailRecoverer` contract stores a recovery attempt keyed by `request_id`, which the frontend polls via `get_recovery_attempt(request_id)`.

Troubleshooting: if you see an Outlayer panic like `missing field \`source\``, the Outlayer `request_execution` API expects `source` (not legacy `code_source`) and `resource_limits` must use JSON numbers (not strings).

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
  options: { onEvent: (ev) => console.log(ev) },
})

window.open(mailtoUrl, '_blank', 'noopener,noreferrer')

await tatchi.finalizeEmailRecovery({
  accountId: 'alice.testnet',
  nearPublicKey, // optional if you are resuming from pending state
  options: { onEvent: (ev) => console.log(ev) },
})
```

The user must send the email **from** one of the recovery emails configured on-chain (via `setRecoveryEmails`). If they send from a different address, DKIM/policy verification will fail and you should restart the flow.

### Customizing the confirmation prompt

Email recovery runs inside the same wallet confirmation system as other sensitive flows. You can override the confirmer copy and confirmation UX:

```ts
await tatchi.startEmailRecovery({
  accountId: 'alice.testnet',
  options: {
    confirmerText: {
      title: 'Recover account',
      body: 'Approve to create a new device key and start email recovery.',
    },
    confirmationConfig: {
      behavior: 'requireClick',
    },
  },
});
```

### Cancelling / restarting

If the user backs out after opening the mail client (or you want a “Start over” button), you can cancel the in-flight flow:

```ts
await tatchi.cancelEmailRecovery({ accountId: 'alice.testnet' });
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
  options: {
    onEvent: (ev) => {
      if (ev?.data && 'requestId' in ev.data) {
        console.log('email recovery requestId', ev.data.requestId)
      }
    },
  },
})
```
