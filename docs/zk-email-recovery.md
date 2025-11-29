# ZK Email Recovery — Current DKIM Flow (and Future ZK Path)

This document describes what is **actually implemented** today for email‑based recovery, and what remains for the zk‑email path.

At a high level:

- Cloudflare Email Routing delivers emails for `RECOVER_EMAIL_RECIPIENT` (for example, `recover@web3authn.org`) into a single Worker: `w3a-relay`.
- The Worker’s `email` handler:
  - Normalizes the message into a JSON payload.
  - Parses the NEAR `account_id` from the subject / headers.
  - Calls `AuthService.recoverAccountFromEmailDKIMVerifier` to invoke the per‑account `EmailRecoverer` contract.
- The `EmailRecoverer` contract and `EmailDKIMVerifier` handle DKIM proof verification and account recovery logic.
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
5. Call the DKIM recovery helper on the shared `AuthService` instance:
   ```ts
   const result = await service.recoverAccountFromEmailDKIMVerifier({
     accountId,
     emailBlob: payload.raw,
   });
   console.log('[email] DKIM recovery result', JSON.stringify(result));
   ```
6. Handle result:
   - On failure:
     ```ts
     console.log('[email] DKIM recovery failed', { accountId, error: result?.error });
     message.setReject('Recovery relayer rejected email');
     ```
   - On success:
     ```ts
     console.log('[email] DKIM recovery succeeded', { accountId, tx: result.transactionHash });
     ```

The email handler no longer forwards debug copies (`message.forward('dev@...')` was removed).

---

## 2. DKIM Recovery Helper (`AuthService.recoverAccountFromEmailDKIMVerifier`)

Path: `sdk/src/server/core/AuthService.ts`

We added a dedicated helper on `AuthService`:

```ts
async recoverAccountFromEmailDKIMVerifier(request: { accountId: string; emailBlob: string }): Promise<{
  success: boolean;
  transactionHash?: string;
  message?: string;
  error?: string;
}>
```

Behavior:

1. Validate inputs:
   - `accountId` must pass `isValidAccountId`.
   - `emailBlob` must be a non‑empty string.
2. Ensure the signer and relayer account are initialized (WASM + Shamir).
3. Queue a transaction (to avoid nonce races) that:
   - Builds a single `FunctionCall` action:
     ```ts
     const contractArgs = { email_blob: emailBlob };
     const actions: ActionArgsWasm[] = [
       {
         action_type: ActionType.FunctionCall,
         method_name: 'verify_dkim_and_recover',
         args: JSON.stringify(contractArgs),
         gas: DEFAULT_EMAIL_RECOVERY_GAS,            // 300 TGas
         deposit: '10000000000000000000000',         // 0.01 NEAR
       },
     ];
     ```
   - Signs and sends the transaction from the relayer:
     - `signer_id = relayerAccountId` (e.g. `w3a-relayer.testnet`)
     - `receiver_id = accountId` (e.g. `bob.w3a-v1.testnet`)
4. Parse the execution outcome:
   - Uses `parseContractExecutionError` to extract human‑readable errors from receipts.
   - Returns:
     - `{ success: true, transactionHash, message }` on success.
     - `{ success: false, error, message }` on failure.

Notes:

- `DEFAULT_EMAIL_RECOVERY_GAS = '300000000000000'` (300 TGas), aligned with a working `near-cli` example:
  - `prepaid-gas '300.0 Tgas' attached-deposit '0.01 NEAR'`.
- Over‑prepaid gas is refunded on NEAR; only gas actually burned is charged.

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

The zk‑email recovery flow is intentionally left as future work. Stubs and planned points of integration:

- `sdk/src/server/email-recovery/zkEmail.ts`
  - `generateZkEmailProofFromPayload(payload)` is a stub; it will eventually:
    - Normalize headers + raw message for the ZK circuit.
    - Call an external prover (e.g. Succinct SP1) to produce `proof` + `publicInputs`.

- `AuthService.recoverAccountFromZkEmailVerifier(...)`
  - Currently returns a fixed `"not yet implemented"` error.
  - Intended future behavior:
    - Call a global `ZkEmailVerifier` contract with the proof.
    - Then call the per‑user recovery contract once the proof is accepted.

- Worker routing:
  - Today, the `email` handler always calls the DKIM path.
  - In the future, different Subject prefixes (e.g. `zkrecover|...`) could be routed to the ZK path instead.

Until those pieces are wired up, the system implements **DKIM‑based email recovery** only. ZK‑email remains a design target with helper scaffolding in place but no on‑chain verifier integration yet.
