# EmailRecoveryService Refactor Plan

This document outlines a refactor plan for `sdk/src/server/email-recovery/index.ts`
to make the email recovery code easier to maintain without changing the public
API of the SDK.

Today, `EmailRecoveryService` owns:

- Mode detection (`zk-email` / `tee-encrypted` / `onchain-public`),
- DKIM/TEE encryption and global `EmailDKIMVerifier` calls,
- Per-account `EmailRecoverer` encrypted path,
- ZK-email transaction wiring,
- Shared types and dependency wiring.

The file has grown large; the goal is to split it into focused helpers while
keeping `EmailRecoveryService` as a thin orchestrator.

## 1. Extract shared types

Create `sdk/src/server/email-recovery/types.ts`:

- Move the following interfaces/types:
  - `EmailRecoveryServiceDeps`
  - `EmailRecoveryRequest`
  - `EmailRecoveryDispatchRequest`
  - `EmailRecoveryMode`
  - `EmailRecoveryResult`
- Export them from `types.ts` and re-export from `index.ts` so external
  callers can continue importing from `@tatchi-xyz/sdk/server`.

## 2. Isolate mode detection

Create `sdk/src/server/email-recovery/mode.ts`:

- Export:
  ```ts
  export function determineRecoveryMode(input: {
    explicitMode?: string;
    emailBlob?: string;
  }): EmailRecoveryMode;
  ```
- Move the current private `determineRecoveryMode` implementation out of
  `EmailRecoveryService` into this file (unchanged logic).
- In `index.ts`, import `determineRecoveryMode` and use it inside
  `requestEmailRecovery`, instead of a private method.

## 3. Outlayer / DKIM key helper

Create `sdk/src/server/email-recovery/outlayerKey.ts`:

- Export a small helper/factory that wraps the Outlayer X25519 public key
  fetch and caching:
  ```ts
  export function createOutlayerKeyFetcher(deps: {
    nearClient: MinimalNearClient;
    emailDkimVerifierAccountId: string;
  }): () => Promise<Uint8Array>;
  ```
- Move the logic from `EmailRecoveryService.getOutlayerEmailDkimPublicKey`
  into this helper, including base64 decode and length checks.
- In `EmailRecoveryService`, either:
  - Keep a private method that delegates to the helper, or
  - Store the fetcher function as a private field initialized in the
    constructor.

## 4. Split per-mode request helpers

Create dedicated helpers for each path; these should be pure-ish functions
that take `deps` + validated request params and return `Promise<EmailRecoveryResult>`.

### 4.1 Global DKIM encrypted path

File: `sdk/src/server/email-recovery/teeEncryptedPath.ts`

- Export:
  ```ts
  export async function requestTeeEncryptedVerification(
    deps: EmailRecoveryServiceDeps,
    args: { accountId: string; emailBlob: string }
  ): Promise<EmailRecoveryResult>;
  ```
- Move the body of `verifyEncryptedEmailAndRecover` (after validation)
  into this helper:
  - Fetch Outlayer public key via the helper from step 3.
  - Build `context: EmailEncryptionContext`.
  - Call `encryptEmailForOutlayer`.
  - Construct `request_email_verification` actions for the global
    `EmailDKIMVerifier`.
  - Send the transaction and parse errors.

`EmailRecoveryService.verifyEncryptedEmailAndRecover` then becomes:

```ts
async verifyEncryptedEmailAndRecover(request: EmailRecoveryRequest) {
  // validate accountId/emailBlob
  // ensure signer/relayer
  return queueTransaction(
    () => requestTeeEncryptedVerification(this.deps, { accountId, emailBlob }),
    `encrypted email recovery (dkim) for ${accountId}`,
  );
}
```

### 4.2 Per-account encrypted path (EmailRecoverer)

File: `sdk/src/server/email-recovery/accountEncryptedPath.ts`

- Export:
  ```ts
  export async function requestAccountEncryptedRecover(
    deps: EmailRecoveryServiceDeps,
    args: { accountId: string; emailBlob: string }
  ): Promise<EmailRecoveryResult>;
  ```
- Move the body of `verifyEncryptedEmailAndRecover` (after validation) into
  this helper:
  - Fetch Outlayer public key via the helper from step 3.
  - Build AEAD context `{ account_id, network_id, payer_account_id }` and call `encryptEmailForOutlayer`.
  - Construct actions to call the per-account `EmailRecoverer` contract:
    - `receiverId = accountId`.
    - `method_name = 'verify_encrypted_email_and_recover'`.
    - `args = { encrypted_email_blob: envelope, aead_context: context }`.
  - Send transaction and parse errors.

`EmailRecoveryService.verifyEncryptedEmailAndRecover` then delegates to this
helper inside `queueTransaction`, mirroring the pattern in 4.1.

### 4.3 ZK-email path wiring

We already have `zkEmail.ts` for prover client and bindings. To keep concerns
clear:

- Add `sdk/src/server/email-recovery/zkEmailPath.ts`:
  ```ts
  export async function requestZkEmailVerificationTx(
    deps: EmailRecoveryServiceDeps,
    args: { accountId: string; emailBlob: string }
  ): Promise<EmailRecoveryResult>;
  ```
- Move the transaction-building portion of
  `EmailRecoveryService.verifyZkemailAndRecover` into this helper:
  - Use existing helpers from `zkEmail.ts` (`buildForwardablePayloadFromRawEmail`,
    `extractZkEmailBindingsFromPayload`, `generateZkEmailProofFromPayload`).
  - Build `verify_zkemail_and_recover` call to the per-account `EmailRecoverer`.

`EmailRecoveryService.verifyZkemailAndRecover` then:

- Validates inputs and prover config,
- Ensures signer/relayer,
- Wraps `requestZkEmailVerificationTx` in `queueTransaction`.

## 5. Keep EmailRecoveryService as a thin orchestrator

After the above:

- `EmailRecoveryService`:
  - Holds `deps` and any small caches (e.g. Outlayer public key fetcher).
  - Performs validation (`accountId`, `emailBlob`, prover config).
  - Handles `ensureSignerAndRelayerAccount` + `queueTransaction`.
  - Routes:
    - `requestEmailRecovery` → `determineRecoveryMode` → per-mode helper.
    - `verifyEncryptedEmailAndRecover` → `requestAccountEncryptedRecover`.
    - `verifyZkemailAndRecover` → `requestZkEmailVerificationTx`.

This keeps the public class API unchanged while moving the heavy lifting into
small, testable functions.

## 6. Tests and docs to update

- Ensure existing tests continue to pass:
  - `sdk/src/__tests__/unit/emailRecoveryService.test.ts`
  - `sdk/src/__tests__/unit/emailEncryption*.test.ts`
  - `sdk/src/__tests__/unit/emailEncryptionOutlayerCompat.test.ts`
- If new helper files introduce meaningful logic (e.g. mode detection or
  Outlayer key fetching), consider adding small unit tests for them in
  `sdk/src/__tests__/unit/`.
- Update any internal docs that refer to the old structure (if they mention
  `requestOnchainEmailVerification`, ensure they now refer to
  `verifyEncryptedEmailAndRecover` where appropriate).
