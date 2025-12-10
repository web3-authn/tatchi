# ZK Email Prover – SDK Integration

This document summarizes how the Web3Authn relayer SDK integrates with a
zk-email prover server for email-based account recovery.

## Prover HTTP API

- Method: `POST`
- Path: `/prove-email`
- Content-Type: `application/json`
- Request body:
  ```json
  { "rawEmail": "<full .eml contents as a UTF-8 string>" }
  ```
- Response body:
  ```json
  {
    "proof": { /* Groth16 proof object */ },
    "publicSignals": ["...", "..."]
  }
  ```

`rawEmail` must be the full RFC822 email (headers + body). The prover runs the
`RecoverEmailCircuit` and returns a BN254 Groth16 proof plus its public signals.

## SDK components

- `sdk/src/server/email-recovery/zkEmail.ts`
  - `generateZkEmailProofFromPayload(payload, opts)`:
    - Calls `POST {baseUrl}/prove-email` with `{ rawEmail: payload.raw }`.
    - Returns `{ proof, publicInputs }` (public inputs mirror `publicSignals`).
  - `extractZkEmailBindingsFromPayload(payload)`:
    - Extracts `{ accountId, newPublicKey, fromEmail, timestamp }` from:
      - `Subject: recover-<request_id> <accountId> ed25519:<new_public_key>`
      - `From:` and `Date:` headers.

- `sdk/src/server/email-recovery/index.ts` (`EmailRecoveryService`)
  - `zkEmailProver?: { baseUrl: string; timeoutMs?: number }` in deps.
  - `requestEmailRecovery({ accountId, emailBlob, explicitMode? })`:
    - Chooses mode:
      - `explicitMode` if provided.
      - Otherwise first non-empty body line: `zk-email` / `tee-encrypted` / `onchain-public` (also accepts legacy `encrypted` / `tee` as aliases for `tee-encrypted`).
      - Defaults to `tee-encrypted` (TEE/DKIM path).
  - `verifyZkemailAndRecover({ accountId, emailBlob })`:
    - Normalizes `emailBlob`, parses bindings via `extractZkEmailBindingsFromPayload`.
    - Calls `generateZkEmailProofFromPayload` to get `{ proof, publicInputs }`.
    - Sends `verify_zkemail_and_recover` with:
      `{ proof, public_inputs, account_id, new_public_key, from_email, timestamp }`.

## Relayer usage

From an HTTP handler or worker:

```ts
const result = await authService.emailRecovery?.requestEmailRecovery({
  accountId,   // parsed from Subject / headers
  emailBlob,   // raw .eml as UTF-8 string
  // optional: explicitMode: 'zk-email' | 'tee-encrypted' | 'onchain-public'
});
```

- To force zk-email, set `explicitMode: 'zk-email'` or use `zk-email` as the
  first non-empty body line.
- On success, `result.success === true` and `result.transactionHash` contains
  the NEAR tx hash.
- On failure, `result.success === false` and `result.error` will contain a
  structured error code (parse error, prover error, contract error, etc.).
