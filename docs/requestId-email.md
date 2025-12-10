# Email `request_id` Tracking – Frontend & Relayer TODO

This doc tracks the **frontend + relayer SDK** work around `request_id` for email recovery.
Scope here is limited to:
- Dispatching email via the relayer (`EmailRecoveryService`).
- Tracking a short `requestId` on the frontend.
- Polling `email-dkim-verifier-contract.get_verification_result(request_id)`.
- Emitting `EmailRecoveryPhase` events, surfacing errors, and saving the new passkey on success.

## 1. Relayer SDK – `EmailRecoveryService`

- [x] **Dispatch encrypted email via `EmailRecoveryService`**
  - `EmailRecoveryService.verifyEncryptedEmailAndRecover({ accountId, emailBlob })`:
    - Encrypts the raw `.eml` with `encryptEmailForOutlayer`.
    - Sends `verify_encrypted_email_and_recover(encrypted_email_blob, aead_context)` to the
      **per‑account** `EmailRecoverer` contract deployed to `accountId`, where:
      - `encrypted_email_blob = envelope` returned by `encryptEmailForOutlayer`.
      - `aead_context = { account_id, network_id, payer_account_id }` (forwarded AEAD context).
    - The per‑account `EmailRecoverer` then delegates to the global `EmailDKIMVerifier` contract,
      which talks to the Outlayer worker, performs DKIM verification, and stores a `VerificationResult`
      keyed by `request_id` so the frontend can poll `get_verification_result(request_id)`.
  - `EmailRecoveryService.requestEmailRecovery` routes `explicitMode: 'tee-encrypted'` (or default) into `verifyEncryptedEmailAndRecover`.

- [x] **Route TEE‑encrypted (requestId) path through per‑account `EmailRecoverer`**
  - Target design:
    - `EmailRecoveryService.verifyEncryptedEmailAndRecover({ accountId, emailBlob })`:
      - Encrypts the email and calls `verify_encrypted_email_and_recover(encrypted_email_blob, aead_context)`
        on the **per‑account** `EmailRecoverer` contract deployed to `accountId`.
      - `EmailRecoverer` forwards `encrypted_email_blob` + `aead_context` to the global `EmailDKIMVerifier`
        (TEE path), which:
        - Talks to the Outlayer worker for DKIM verification.
        - Populates `verification_results_by_request_id` so
          `get_verification_result(request_id)` remains the single view that the frontend polls.
  - This keeps recovery policy / per‑user state encapsulated in `EmailRecoverer` while still using
    `EmailDKIMVerifier.get_verification_result(request_id)` as the canonical status API for the SDK.

- [x] **Support `recover-<request_id> …` subject format in relayer helpers**
  - `examples/relay-cloudflare-worker/src/worker-helpers.ts`:
    - `parseAccountIdFromEmailPayload` parses `Subject: recover-<request_id> <accountId> ed25519:<pk>` and returns the same `accountId` as before.

- [ ] **(Optional) Log `request_id` through the relayer pipeline**
  - Plumb parsed `request_id` into relayer logs (email handler, `EmailRecoveryService`, zk-email path) to correlate:
    - frontend request → user email → DKIM verification → `get_verification_result(request_id)` result.

---

## 2. Frontend SDK – `EmailRecoveryFlow` (`sdk/src/core/TatchiPasskey/emailRecovery.ts`)

### 2.1 Generate and Track `requestId`

- [x] **Generate a short `requestId` when starting email recovery**
  - `generateEmailRecoveryRequestId()`:
    - Returns a 6-character `[A-Z0-9]{6}` identifier using `crypto.getRandomValues`.

- [x] **Store `requestId` in the pending record**
  - `PendingEmailRecovery` includes:
    - `requestId: string;`
  - On `start`:
    - A `PendingEmailRecovery` is created with a fresh `requestId` and persisted in IndexedDB under `pendingEmailRecovery:<accountId>:<nearPublicKey>`.

- [x] **Embed `requestId` into the email Subject**
  - `buildMailtoUrlInternal(rec)` builds:
    - `subject = "recover-<requestId> <accountId> <nearPublicKey>"`.
  - This is what the user’s mail client sends and what the DKIM + Outlayer pipeline parses.

- [x] **Include `requestId` in SSE events**
  - Step 3 (`EmailRecoveryPhase.STEP_3_AWAIT_EMAIL`):
    - Event `data` includes `{ accountId, recoveryEmail, nearPublicKey, requestId, mailtoUrl }`.
  - Polling step (`EmailRecoveryPhase.STEP_4_POLLING_ADD_KEY`):
    - Event `data` includes `{ accountId, requestId, nearPublicKey, elapsedMs }`.

### 2.2 Poll by `requestId` via `get_verification_result`

- [x] **Configure verifier contract + view method**
  - `TatchiPasskeyConfigs.relayer.emailRecovery` includes:
    - `dkimVerifierAccountId?: string;`
    - `verificationViewMethod?: string; // default 'get_verification_result'`
  - Defaults are set in `sdk/src/core/defaultConfigs.ts` (testnet preset).

- [x] **Call `get_verification_result(request_id)` from the frontend**
  - `EmailRecoveryFlow.checkVerificationStatus(rec)`:
    - Calls `nearClient.view<{ request_id: string }, VerificationResult | null>({
        account: dkimVerifierAccountId,
        method: verificationViewMethod,
        args: { request_id: rec.requestId },
      })`.
    - Interprets results as:
      - `null` → pending (not completed).
      - `{ verified: false, … }` → completed + failure (captures `error_message` / `error_code` when present).
      - `{ verified: true, … }` → completed + success (optionally checks `account_id` / `new_public_key`).

- [x] **Use verification result as the source of truth**
  - `EmailRecoveryFlow.pollUntilAddKey(rec)`:
    - Requires `dkimVerifierAccountId` (errors if missing).
    - Loops until:
      - Verification remains pending (emits progress events with `elapsedMs`).
      - Verification completes with failure (emits error, marks record `status = 'error'`, stops).
      - Verification completes with success (sets `status = 'finalizing'`, proceeds to registration).
    - Uses `maxPollingDurationMs` + `pollingIntervalMs` from config for timeouts.

### 2.3 Events – `EmailRecoveryPhase` and Error Surfacing

- [x] **Emit `EmailRecoveryPhase` events for each step**
  - Step 1 – preparation:
    - `EmailRecoveryPhase.STEP_1_PREPARATION` when the flow begins and environment is validated.
  - Step 2 – TouchID / credential collection:
    - `EmailRecoveryPhase.STEP_2_TOUCH_ID_REGISTRATION` while collecting the WebAuthn passkey and deriving keys.
  - Step 3 – awaiting email:
    - `EmailRecoveryPhase.STEP_3_AWAIT_EMAIL` once `mailto:` is ready and the pending record is saved.
  - Step 4 – polling:
    - `EmailRecoveryPhase.STEP_4_POLLING_ADD_KEY` while calling `get_verification_result(request_id)`.
  - Step 5 – finalizing registration:
    - `EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION` while signing and sending the deterministic registration transaction.
  - Step 6 – complete:
    - `EmailRecoveryPhase.STEP_6_COMPLETE` when registration + local persistence succeed.
  - Resume case:
    - `EmailRecoveryPhase.RESUMED_FROM_PENDING` when `finalize` is called and a pending record is resumed.

- [x] **Emit error events and invoke `onError` on failures**
  - `emitError(step, message)`:
    - Sets `phase = EmailRecoveryPhase.ERROR`, `status = EmailRecoveryStatus.ERROR`.
    - Emits an `EmailRecoveryErrorEvent` (step `0` / `Error` phase).
    - Calls `options.onError?.(Error(message))`.
  - Used for:
    - Invalid inputs (bad `accountId`, missing pending record, etc.).
    - TouchID / PRF / VRF derivation failures.
    - `get_verification_result` failures or negative results.
    - Registration / broadcast failures.

### 2.4 Save New Passkey on Successful Verification

- [x] **Finalize registration only after successful verification**
  - `finalize(args)`:
    - Resumes pending record.
    - Ensures verification has completed successfully via `pollUntilAddKey(rec)`.
    - Calls `finalizeRegistration(rec)` on success.

- [x] **Persist the new passkey and emit completion events**
  - `finalizeRegistration(rec)`:
    - Emits `EmailRecoveryPhase.STEP_5_FINALIZING_REGISTRATION`.
    - Signs the deterministic registration transaction with the derived key.
    - Sends the transaction via `nearClient.sendTransaction`.
    - Updates nonce manager best-effort.
    - Stores the new device in IndexedDB via `webAuthnManager.storeUserData` (saving the new passkey and encrypted VRF keypair).
    - Marks the flow as complete:
      - Sets `status = 'complete'` on the pending record.
      - Emits `EmailRecoveryPhase.STEP_6_COMPLETE` with `status = SUCCESS`.
    - Triggers `attemptAutoLogin(rec)` to log the user in using the new passkey.

- [ ] **(Nice-to-have) Add focused tests for the end-to-end email recovery flow**
  - Mock `nearClient.view` to return:
    - Pending → Success → Failure cases for `get_verification_result(request_id)`.
  - Assert:
    - Correct `EmailRecoveryPhase` events are emitted.
    - Errors are surfaced via `EmailRecoveryErrorEvent` and `onError`.
    - On success, `storeUserData` has been called and `STEP_6_COMPLETE` is emitted.
