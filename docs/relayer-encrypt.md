# Relayer Guide: Encrypting Emails for Outlayer DKIM Verification

This guide explains how a relayer should encrypt the raw email and send the ciphertext into the `EmailRecoverer` / `EmailDKIMVerifier` flow.

The goal is: **validators and indexers only ever see ciphertext**, while the Outlayer worker (holding the private decryption key) decrypts and verifies DKIM off‑chain.

## 1. Obtain the encryption key

The system initiates a **Public-Key / KEM (Key Encapsulation Mechanism)** design. The relayer does **not** need to hold any long-term secrets.

1.  **Worker (Receiver)**: Holds the **Private Decryption Key** in its secure Outlayer environment (accessible only to the TEE).
2.  **Contract (Registry)**: Stores the corresponding **Public Encryption Key**.

The relayer must fetch this public key from the contract before encrypting:

**Method**: `get_outlayer_encryption_public_key`
**Returns**: `String` (Base64-encoded Public Key, typically X25519)

Example (NEAR CLI):
```bash
near view <contract-id> get_outlayer_encryption_public_key
```

## 2. Construct the encrypted envelope

Before sending a transaction, the relayer uses a **non‑interactive Hybrid Encryption** scheme (KEM + AEAD, ECIES‑like) to encrypt the email.

### The Mechanism (KEM + AEAD, non‑interactive)

1.  **Generate Ephemeral Keys**: Create a random ephemeral keypair (e.g., X25519) for this specific transaction.
    *   `ephemeral_sk` (Secret)
    *   `ephemeral_pk` (Public)
2.  **Derive Shared Secret**: Perform a one‑shot X25519 Diffie‑Hellman operation between `ephemeral_sk` and the contract’s `recipient_pk`:
    *   `shared_point = X25519(ephemeral_sk, recipient_pk)`
3.  **Derive Symmetric Key (KEM)**: Use a KDF (e.g., HKDF-SHA256) to turn the `shared_point` into a `symmetric_key`.
4.  **Encrypt Data (AEAD)**: Use `symmetric_key` to encrypt the email using an AEAD scheme (e.g., ChaCha20-Poly1305).

> Note: we use the X25519 “ECDH” primitive in a **non‑interactive** way: the relayer needs only the worker’s public key and sends a single request containing `ephemeral_pub` + ciphertext. There is no handshake or multi‑round protocol as in TLS; this is a KEM + AEAD pattern, not an interactive key‑exchange protocol.

### JSON Envelope

The worker expects the following JSON structure:

```rust
#[derive(Deserialize)]
struct EncryptedEmailEnvelope {
    version: u8,
    ephemeral_pub: String, // The Relayer's ephemeral public key
    nonce: String,         // Nonce used for the AEAD
    ciphertext: String,    // The encrypted email body
}
```

### Step-by-Step Implementation Guide

1.  **Inputs**:
    *   `recipient_pk` (from Contract, base64 decoded).
    *   `email_raw` (the email bytes).
    *   `context` (JSON string of params, used as AAD).
2.  **Key Gen**:
    *   `ephemeral_sk, ephemeral_pk = X25519_Generate()`
3.  **Key Derivation**:
    *   `shared_secret = X25519_ECDH(ephemeral_sk, recipient_pk)`
    *   `symmetric_key = HKDF(shared_secret, info="email-dkim-encryption-key")` to match the worker’s implementation.
4.  **Encryption**:
    *   Generate random `nonce` (12 bytes).
    *   `aad = JSON.stringify(context)`
    *   `ciphertext_bytes = ChaCha20Poly1305_Encrypt(symmetric_key, nonce, email_raw, aad)`
5.  **Serialize**:
    *   `ephemeral_pub` = Base64(`ephemeral_pk`)
    *   `nonce` = Base64(`nonce`)
    *   `ciphertext` = Base64(`ciphertext_bytes`)

```json
{
  "version": 1,
  "ephemeral_pub": "<base64_ephemeral_pk>",
  "nonce": "<base64_nonce>",
  "ciphertext": "<base64_ciphertext>"
}
```

## 3. Call the NEAR contracts

The relayer submits the `EncryptedEmailEnvelope` JSON to the **private TEE path** on the contract.

1.  Build the envelope JSON as above.
2.  Call `EmailDKIMVerifier::request_email_verification`.

```json
{
  "payer_account_id": "<relayer.near>",
  "email_blob": null,
  "encrypted_email_blob": {
    "version": 1,
    "ephemeral_pub": "<base64_ephemeral_pk>",
    "nonce": "<base64_nonce>",
    "ciphertext": "<base64_ciphertext>"
  },
  "params": {
    "account_id": "<recovered-account.testnet>",
    "payer_account_id": "<relayer.near>",
    "network_id": "testnet"
  }
}
```

### On-Chain & Worker Flow
1.  **Contract**: Forwards the `encrypted_email_blob` blindly to the Outlayer Worker.
2.  **Outlayer Worker**:
    *   Reads its `OUTLAYER_EMAIL_DKIM_SK` (base64 X25519 private key).
    *   Reads `ephemeral_pub` from the input.
    *   Performs ECDH(`private_key`, `ephemeral_pub`) -> `shared_point`.
    *   Derives `symmetric_key`.
    *   Decrypts `ciphertext` using `nonce` and AAD context.
    *   Proceeds with DKIM verification on the plaintext.

## 4. Selecting Between ZK, TEE, and On-Chain Email Recovery

Long-term, the relayer should support three recovery modes:

- **`zk-email`** — ZK‑email recovery:
  - Generate a zk‑email proof from the raw message.
  - Call a global `ZkEmailVerifier` contract.
  - Then call the per‑account `EmailRecoverer` once the proof is accepted.
- **`encrypted`** — TEE DKIM recovery (this document):
  - Encrypt the raw email with X25519 + HKDF‑SHA256 + ChaCha20‑Poly1305.
  - Send the ciphertext to `EmailDKIMVerifier::request_email_verification`.
- **`onchain-public`** — On‑chain email recovery:
  - Use only on‑chain state and public inputs (e.g. hashed recovery emails stored in `EmailRecoverer`),
  - No TEE decryption or ZK‑email verifier.

The relayer needs a simple, explicit **mode hint** in the email so it can choose which path to invoke:

- Initial idea:
  - Add a short marker in the **email body**, for example:
    - First non‑empty line:
      `zk-email | encrypted | onchain-public`
  - The relayer parses the body, extracts the selected token, and chooses:
    - `zk-email`  → ZK‑email pipeline.
    - `encrypted` → TEE DKIM encryption pipeline (this doc).
    - `onchain-public` → on‑chain recovery pipeline.
- Robustness considerations:
  - Body text can be mangled by clients (quoting, signatures, HTML conversions).
  - To make this more reliable, the relayer can:
    - Prefer a dedicated header (for example: `X-W3A-Recovery-Mode: zk-email|encrypted|onchain-public`) when present.
    - Fall back to a Subject prefix (as sketched in `docs/zk-email-recovery.md`, e.g. `zkrecover|...`) or the body marker when no header is set.
  - Absence of an explicit mode should **default to a safe, backwards‑compatible behavior** (for example, `encrypted` once that path is fully rolled out).

In the `EmailRecoveryService` implementation, this becomes:

- A small parser that looks at:
  - the first non‑empty body line (`zk-email | encrypted | onchain-public`),
  - and returns one of: `'zk-email' | 'encrypted' | 'onchain-public'`.
- A dispatcher that:
  - Routes `encrypted` to `requestEncryptedEmailVerification(...)` (this TEE flow).
  - Routes `zk-email` to the future `recoverAccountFromZkEmailVerifier(...)` path.
  - Routes `onchain-public` to a pure on‑chain `EmailRecoverer` call (no TEE / ZK), once that contract API is finalized.

## 5. Relayer Implementation TODOs (EmailRecoveryService)

This section is a concrete checklist for wiring the encrypted DKIM flow into a dedicated `EmailRecoveryService` under `sdk/src/server/email-recovery`, and exposing it through `AuthService`:

- `EmailRecoveryService` in `sdk/src/server/email-recovery/index.ts`.
- `AuthService` in `sdk/src/server/core/AuthService.ts` (with a new `emailRecovery` property).
- HTTP routers in `sdk/src/server/router/{express-adaptor,cloudflare-adaptor}.ts`.
- The example Cloudflare worker in `examples/relay-cloudflare-worker/src/worker.ts`.

1. **Crypto types & helpers (`sdk/src/server/email-recovery`)**
   - [x] Define TypeScript types in `teeEmail.ts` (or a sibling file) for:
     - [x] `EncryptedEmailEnvelope` (`version`, `ephemeral_pub`, `nonce`, `ciphertext`).
     - [x] `EmailEncryptionContext` / `EmailDkimParams` (matches the `params` JSON passed to the contract).
   - [x] Implement a pure helper `encryptEmailForOutlayer(input)` that:
     - [x] Accepts `{ emailRaw: string, context: EmailEncryptionContext, recipientPk: Uint8Array }`.
     - [x] Generates `ephemeral_sk, ephemeral_pk` (X25519).
     - [x] Derives `shared_secret = X25519_ECDH(ephemeral_sk, recipient_pk)`.
     - [x] Derives `symmetric_key = HKDF(shared_secret, info="email-dkim-encryption-key")`.
     - [x] Encrypts with ChaCha20‑Poly1305 using a 12‑byte `nonce` and `JSON.stringify(context)` as AAD.
     - [x] Returns `{ envelope: EncryptedEmailEnvelope, context }`.
   - [x] Add a test-only decrypt helper to round-trip an envelope in unit tests (fixed X25519 keypair + nonce).

2. **EmailRecoveryService class (`sdk/src/server/email-recovery/teeEmail.ts`)**
   - [x] Introduce an `EmailRecoveryService` class responsible for all DKIM/TEE email flows:
     - [x] Constructor accepts a config with:
       - [x] `relayerAccountId`, `relayerPrivateKey`, `networkId`.
       - [x] `emailDkimVerifierAccountId` (defaulting to `EMAIL_DKIM_VERIFIER_ACCOUNT_ID` from `sdk/src/core/EmailRecovery/index.ts`).
       - [x] A `MinimalNearClient` instance or factory.
       - [x] A function for queuing transactions (so it can reuse `AuthService.queueTransaction`).
     - [x] Holds its own cache of the Outlayer X25519 public key (`recipient_pk`).
   - [x] Implement a private helper `getOutlayerEmailDkimPublicKey()` that:
     - [x] Calls `get_outlayer_encryption_public_key` on `emailDkimVerifierAccountId` via `MinimalNearClient`.
     - [x] Decodes the base64 result into a 32‑byte X25519 `recipient_pk`.
     - [x] Caches the decoded key and invalidates it on hard failures.
   - [x] Implement a public method `requestEncryptedEmailVerification(request)`:
     - [ ] Signature idea:
       ```ts
       requestEncryptedEmailVerification(request: {
         accountId: string;
         emailBlob: string;
       }): Promise<{ success: boolean; transactionHash?: string; message?: string; error?: string }>;
       ```
     - [x] Validates `accountId` and `emailBlob`.
     - [x] Builds `context` from:
       - [x] `account_id` = target NEAR account.
       - [x] `payer_account_id` = relayer account.
       - [x] `network_id` = network id.
     - [x] Calls `getOutlayerEmailDkimPublicKey()` and `encryptEmailForOutlayer(...)` to produce the envelope.
     - [x] Uses the injected transaction queue + signer helpers to send a transaction to `emailDkimVerifierAccountId` calling `request_email_verification` with:
       - [x] `payer_account_id`.
       - [x] `email_blob = null`.
       - [x] `encrypted_email_blob` (the envelope).
       - [x] `params` (the same `context` JSON used as AAD).
     - [x] Parses the outcome and returns `{ success, transactionHash, message, error }`.

3. **AuthService wiring (`sdk/src/server/core/AuthService.ts`)**
   - [x] Add a public property:
     - [x] `public emailRecovery: EmailRecoveryService | null;`
   - [x] In the `AuthService` constructor:
     - [x] Instantiate `EmailRecoveryService` with:
       - [x] `relayerAccountId`, `relayerPrivateKey`, `networkId`.
       - [x] `emailDkimVerifierAccountId` (from `EMAIL_DKIM_VERIFIER_ACCOUNT_ID`).
       - [x] A reference to `this.nearClient`.
       - [x] A closure that delegates to `this.queueTransaction(...)` for transaction queuing.
     - [x] Assign `this.emailRecovery = new EmailRecoveryService(...)`.
   - [ ] Update or deprecate the existing `recoverAccountFromEmailDKIMVerifier` method:
     - [ ] Go for Option B: mark it as legacy/plaintext and route new code through `emailRecovery`.

4. **HTTP router integration (`sdk/src/server/router`)**
   - [x] Update Cloudflare adaptor (`cloudflare-adaptor.ts`) `/recover-email` handler to:
     - [x] Keep using `normalizeForwardableEmailPayload` and `parseAccountIdFromSubject`.
     - [x] Continue to treat the request body as `ForwardableEmailPayload` (`raw` + `headers`).
     - [x] Call the new service:
       - [x] `service.emailRecovery?.requestEncryptedEmailVerification({ accountId, emailBlob })`
         and surface an error if `emailRecovery` is not configured.
     - [x] Preserve the current response shape and status codes (`202` on success, `400` on relayer‑level errors).
   - [x] Apply the same change to Express adaptor (`express-adaptor.ts`) `/recover-email` route so Node/Express deployments use the same encrypted `EmailRecoveryService` path.

5. **Cloudflare email worker example (`examples/relay-cloudflare-worker/src/worker.ts`)**
   - [x] Keep `email` entrypoint logic that:
     - [x] Uses `buildForwardableEmailPayload(...)` to build `ForwardableEmailPayload`.
     - [x] Uses `parseAccountIdFromEmailPayload(...)` to derive `accountId`.
   - [x] Swap the DKIM call to use the new service:
     - [x] Replace:
       ```ts
       service.recoverAccountFromEmailDKIMVerifier({ accountId, emailBlob: payload.raw });
       ```
       with:
       ```ts
       service.emailRecovery?.requestEncryptedEmailVerification({ accountId, emailBlob: payload.raw });
       ```
       and handle the case where `emailRecovery` is undefined.
   - [ ] Ensure logs clearly indicate whether the encrypted DKIM path is being used and surface worker/contract errors.

6. **Result handling & future extraction**
   - [ ] Align `EmailRecoveryService`’s return type with the actual `EmailDKIMVerifier` callback / result:
     - [ ] Confirm the on‑chain `VerificationResult` fields (`verified`, `account_id`, `new_public_key`, `from_address`, `email_timestamp_ms`, etc.).
     - [ ] Map those into a stable `{ success, message, error, transactionHash }` shape that does not depend on `AuthService`.
   - [ ] Keep `EmailRecoveryService`’s public API free of `AuthService`-specific types so it can be moved into its own NPM package later with minimal changes.

7. **Testing & validation (service + example)**
   - [ ] Add unit tests in `sdk/src/server/email-recovery` for:
     - [ ] `encryptEmailForOutlayer` round‑trip using the deterministic overrides + `decryptEmailForOutlayerTestOnly` helper.
     - [ ] `EmailRecoveryService.requestEncryptedEmailVerification` with a mocked `MinimalNearClient` to validate both the view call and the `request_email_verification_private` transaction args.
   - [ ] Update or add example flows:
     - [ ] A small script (or README snippet) showing how to POST `/recover-email` (via Express/Cloudflare router) and have it drive the encrypted DKIM path end‑to‑end through `EmailRecoveryService`.

8. **Mode selection and multi-path routing**
   - [ ] Implement a recovery mode parser in `EmailRecoveryService` that:
     - [ ] Reads the first non-empty body line (`zk-email | encrypted | onchain-public`).
     - [ ] Returns one of `'zk-email' | 'encrypted' | 'onchain-public'`, defaulting to a safe mode (likely `encrypted`).
   - [ ] Add a dispatcher method that:
     - [x] Routes `encrypted` to `requestEncryptedEmailVerification(...)`.
     - [ ] Routes `zk-email` to the future `recoverAccountFromZkEmailVerifier(...)` path once wired.
     - [x] Routes `onchain-public` to a pure on-chain `EmailRecoverer` flow (`verify_email_onchain_and_recover(...)`) using the raw `email_blob`.
