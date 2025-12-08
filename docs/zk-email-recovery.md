# ZK Email Recovery — Current DKIM Flow (and Future ZK Path)

This document describes what is **actually implemented** today for email‑based recovery, and what remains for the zk‑email path.

At a high level:

- Cloudflare Email Routing delivers emails for `RECOVER_EMAIL_RECIPIENT` (for example, `recover@web3authn.org`) into a single Worker: `w3a-relay`.
- The Worker’s `email` handler:
  - Normalizes the message into a JSON payload.
  - Parses the NEAR `account_id` from the subject / headers.
  - Calls `AuthService.emailRecovery.requestEncryptedEmailVerification` to invoke the global `EmailDKIMVerifier` contract over an encrypted email blob.
- The `EmailDKIMVerifier` contract and per‑account `EmailRecoverer` handle DKIM proof verification and account recovery logic.
- The zk‑email path (proofs to a ZkEmailVerifier) is **not implemented yet**; helper stubs are in place.

---

## 1. Cloudflare Relay Worker (`w3a-relay`)

Path: `examples/relay-cloudflare-worker/src/worker.ts`

The worker exports three entrypoints:

- `fetch` — HTTP API (create account, sessions, `/recover-email`, etc.).
- `scheduled` — optional cron (Shamir key rotation).
- `email` — invoked by Email Routing for incoming recovery emails.

### 1.1 Email routing configuration

We configure an Email Routing rule for the zone (for example, `web3authn.org`) of the form:

- **Matcher**:
  - `type: "literal"`
  - `field: "to"`
  - `value: "recover@web3authn.org"`
- **Action**:
  - `type: "worker"`
  - `value: ["w3a-relay"]`

In GitHub CI this is created by `deploy-cloudflare.yml` using:

```json
POST /client/v4/zones/$CF_ZONE_ID/email/routing/rules
{
  "enabled": true,
  "name": "recover@web3authn.org to w3a-relay",
  "matchers": [
    { "type": "literal", "field": "to", "value": "recover@web3authn.org" }
  ],
  "actions": [
    { "type": "worker", "value": ["w3a-relay"] }
  ]
}
```

The worker reads the configured recipient from `env.RECOVER_EMAIL_RECIPIENT` and only logs mismatches; Cloudflare routing itself determines which messages reach the worker.

### 1.2 Email normalization helpers

Helpers live in `examples/relay-cloudflare-worker/src/worker-helpers.ts`:

- `normalizeAddress(input: string): string`
  - Strips optional display name: `"Name <user@example.com>" → "user@example.com"`.
  - Lowercases the result.

- `buildForwardableEmailPayload(message): Promise<ForwardableEmailPayload>`
  - Produces:
    ```ts
    type ForwardableEmailPayload = {
      from: string;
      to: string;
      headers: Record<string, string>; // all keys lowercased
      raw: string;                     // full RFC822 message as text
      rawSize?: number;
    };
    ```
  - Lowercases header keys (including `dkim-signature`).

- `parseAccountIdFromEmailPayload(payload): string | null`
  - Reads the Subject and/or headers to extract `account_id`:
    - Accepts either a full RFC822 message with a `Subject:` line or a bare subject value.
    - Expected primary format:
      - `Subject: recover bob.testnet`
        with body containing `ed25519:<new_public_key>`.
    - Logic:
      - Parse Subject, strip common prefixes (`Re:`, `Fwd:`).
      - If it matches `"recover <accountId>"` (case‑insensitive on `recover`), treat `<accountId>` as `account_id`.
      - Otherwise, treat the subject as invalid and rely on header fallbacks.
    - Fallback:
      - `x-near-account-id` or `x-account-id` headers (lowercased).

### 1.3 Email entrypoint

The `email` handler in `worker.ts` orchestrates the DKIM recovery flow:

1. Build normalized payload:
   ```ts
   const payload = await buildForwardableEmailPayload(message);
   ```
2. Log basic details:
   - `from`, `to`, full headers, `dkim-signature`, `rawSize`.
3. Compare `to` against `env.RECOVER_EMAIL_RECIPIENT` (normalized):
   - Mismatches are logged but **not rejected**, since Cloudflare routing already scopes recipients.
4. Parse `accountId`:
   ```ts
   const accountId = parseAccountIdFromEmailPayload(payload);
   if (!accountId) {
     console.log('[email] rejecting: missing accountId in subject or headers');
     message.setReject('Recovery relayer rejected email');
     return;
   }
   ```
5. Call the encrypted DKIM recovery helper on the shared `AuthService` instance:
   ```ts
   const result = await service.emailRecovery.requestEncryptedEmailVerification({
     accountId,
     emailBlob: payload.raw,
   });
   console.log('[email] encrypted DKIM recovery result', JSON.stringify(result));
   ```
6. Handle result:
   - On failure (encrypted DKIM path):
     ```ts
     console.log('[email] encrypted DKIM recovery failed', { accountId, error: result?.error });
     message.setReject('Recovery relayer rejected email');
     ```
   - On success (encrypted DKIM path):
     ```ts
     console.log('[email] encrypted DKIM recovery succeeded', { accountId, tx: result.transactionHash });
     ```

The email handler no longer forwards debug copies (`message.forward('dev@...')` was removed).

---

## 2. DKIM Recovery Helper (`EmailRecoveryService.requestEncryptedEmailVerification`)

Path: `sdk/src/server/email-recovery/teeEmail.ts`

Encrypted DKIM email recovery is now encapsulated in `EmailRecoveryService` and exposed via `AuthService.emailRecovery`:

```ts
const result = await service.emailRecovery.requestEncryptedEmailVerification({
  accountId,
  emailBlob: payload.raw,
});
```

Behavior (high level):

1. Validate inputs:
   - `accountId` must be non‑empty (and should be a valid NEAR account ID).
   - `emailBlob` must be a non‑empty string (full RFC822 message).
2. Ensure the signer and relayer account are initialized (WASM + Shamir) via `AuthService`.
3. Fetch the Outlayer X25519 public key from the `EmailDKIMVerifier` contract (`get_outlayer_encryption_public_key`) and cache it.
4. Build an encryption context:
   - `account_id` = target NEAR account.
   - `payer_account_id` = relayer account.
   - `network_id` = network id.
5. Encrypt `emailBlob` with:
   - X25519 + HKDF‑SHA256 → symmetric key.
   - ChaCha20‑Poly1305 with a random 12‑byte nonce and JSON‑encoded context as AAD.
   - Produces an `EncryptedEmailEnvelope` `{ version, ephemeral_pub, nonce, ciphertext }`.
6. Queue a transaction that:
   - Calls `request_email_verification` on the `EmailDKIMVerifier` contract with:
     - `payer_account_id`.
     - `email_blob = null`.
     - `encrypted_email_blob` (the envelope).
     - `params` (the same context JSON).
   - Signs and sends it from the relayer account.
7. Parse the execution outcome:
   - Uses `parseContractExecutionError` to extract human‑readable errors from receipts.
   - Returns:
     - `{ success: true, transactionHash, message }` on success.
     - `{ success: false, error, message }` on failure.

---

## 3. Frontend: Setting Recovery Emails (Testnet Demo)

Path: `examples/tatchi-docs/src/components/SetupEmailRecovery.tsx`

The demo app exposes an **Email Recovery (beta)** section that:

1. **Hashes recovery emails client‑side**
   - Canonicalizes each email:
     - Extracts bare `local@domain` from `"Name <local@domain>"`.
     - Trims and lowercases entire address.
   - Hashes:
     ```ts
     hashed_email = SHA256(canonical_email + "|" + account_id);
     ```
   - Produces `number[][]` (Vec<u8>) suitable for the `EmailRecoverer` contract.

2. **Deploys / attaches the per‑account EmailRecoverer**
   - Detects whether the account already has code via `nearClient.viewCode(nearAccountId)`.
   - If **no code**:
     - Sends a transaction:
       - `UseGlobalContract` with `accountId: 'w3a-email-recoverer-v1.testnet'`.
       - `FunctionCall` `new(zk_email_verifier, email_dkim_verifier, policy: null, recovery_emails: hashes)`.
   - If **code exists**:
     - Calls `set_recovery_emails(recovery_emails: Vec<HashedEmail>)`.

3. **Configures recovery policy**
   - Sends `set_policy(policy: { min_required_emails, max_age_ms })` to the per‑account contract.

4. **Disables recovery**
   - Calls `set_recovery_emails([])` to clear stored hashed emails (keeps the contract deployed).

5. **Displays on‑chain recovery emails**
   - Calls `get_recovery_emails()` via `nearClient.view`.
   - Shows either:
     - Matching plaintext emails (when they match locally computed hashes).
     - Raw hashes (hex) when no local email matches (privacy preserving).

All of this is currently **testnet‑only** (`tatchi.configs.nearNetwork === 'testnet'`).

---

## 4. What’s NOT implemented yet (ZK path)

The zk‑email recovery flow is intentionally left as future work. Stubs and planned points of integration, with checklists:

- `sdk/src/server/email-recovery/zkEmail.ts`
  - [x] Implement basic zk-email prover client:
    - `generateZkEmailProofFromPayload(payload, opts)` calls an external prover HTTP API (`POST /prove-email`) with `{ rawEmail }`.
    - Handles HTTP/network errors and timeouts, returning `{ proof, publicInputs }` derived from `{ proof, publicSignals }`.
  - [x] Parse subject/headers into bindings (`account_id`, `new_public_key`, `from_email`, `timestamp`).
  - [x] Shape these bindings plus `{ proof, publicInputs }` into the `verify_zkemail_and_recover` contract arguments.
  - [ ] Add more robust validation / logging around parsing and prover responses (e.g. size limits, stricter header checks).

- zk-email mode in `EmailRecoveryService`
  - [x] Route `explicitMode: "zk-email"` to a dedicated zk-email path.
  - [x] Use `generateZkEmailProofFromPayload` to obtain `(proof, publicInputs)` for a given raw email.
  - [x] Construct and send a `verify_zkemail_and_recover` transaction with:
    - `proof` (Groth16),
    - `public_inputs` (Vec<String>),
    - and bound strings (`account_id`, `new_public_key`, `from_email`, `timestamp`).
  - [ ] Expose high-level helpers on `AuthService` (or equivalent) that wrap the zk-email mode for callers.

- Worker / HTTP routing:
  - [x] Cloudflare `email` handler calls `EmailRecoveryService.requestEmailRecovery({ accountId, emailBlob })`, letting the service parse the first non-empty body line to select `zk-email | encrypted | onchain-public`.
  - [x] HTTP endpoint (`POST /recover-email-zk`) accepts `{ accountId, emailBlob }` and forwards to `EmailRecoveryService.requestEmailRecovery`, which performs the same body-based mode selection.
  - [ ] Add metrics and structured logging for zk-email requests and failures.

HTTP callers should:

- Provide the raw `.eml` as `emailBlob` (including mode marker in the body when desired).
- Either:
  - Let `EmailRecoveryService.requestEmailRecovery` parse the first non-empty body line (`zk-email | encrypted | onchain-public`), or
  - Pass an explicit `explicitMode` override when calling from trusted code that already knows the desired path.

Until those pieces are wired up end-to-end (especially worker routing and high-level helpers), the system implements **DKIM‑based email recovery** only. ZK‑email remains a design target with a prover client and relayer-side contract call in place but no production routing yet.
