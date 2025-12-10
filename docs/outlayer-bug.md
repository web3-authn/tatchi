# Outlayer DKIM Decryption Bug – Investigation Notes

This doc summarizes the observed issue where the Outlayer email DKIM worker returns `error: "decryption failed"` for encrypted email verification, even though the same envelopes decrypt correctly in the SDK tests.

## 1. Symptom

- Contract: `email-dkim-verifier-v1.testnet` (EmailDKIMVerifier).
- Call: `request_email_verification` in TEE-encrypted mode.
- Outlayer worker (method `verify-encrypted-email`) returns:

```json
{
  "method": "verify-encrypted-email",
  "params": {
    "verified": false,
    "account_id": "",
    "new_public_key": "",
    "from_address": "",
    "email_timestamp_ms": null,
    "request_id": null,
    "error": "decryption failed"
  }
}
```

This means the worker could not decrypt the encrypted email envelope using its static X25519 secret key + the provided context as AEAD AAD.

## 2. Relevant Crypto / Data Flow

### 2.1 SDK / Relayer (TypeScript)

- File: `sdk/src/server/email-recovery/teeEmail.ts`

Encryption path (`encryptEmailForOutlayer`):

- Inputs:
  - `emailRaw`: full RFC822 email as UTF‑8 string.
  - `context: { account_id, payer_account_id, network_id, ... }`.
  - `recipientPk: Uint8Array` – 32‑byte X25519 public key fetched from `EmailDKIMVerifier::get_outlayer_encryption_public_key`.
- Steps:
  1. Generate ephemeral keypair (X25519 via `@noble/curves`).
  2. Compute shared secret: `sharedSecret = x25519.getSharedSecret(ephemeralSk, recipientPk)`.
  3. Derive symmetric key via HKDF‑SHA256:
     - `info = "email-dkim-encryption-key"`.
     - `key = HKDF(sharedSecret, info)[0..32]`.
  4. Encrypt `emailRaw` with ChaCha20‑Poly1305:
     - `nonce` = 12‑byte random via `crypto.getRandomValues`.
     - `aad` = **canonicalized JSON of `context`**:
       - Keys sorted alphabetically so the JSON bytes are:
         `{"account_id":"…","network_id":"…","payer_account_id":"…"}`.
       - This must match the contract + Outlayer worker’s `context` bytes exactly.
     - Ciphertext = `cipher.encrypt(plaintext)`.
  5. Envelope:
     - `version: 1`
     - `ephemeral_pub`: base64(X25519 ephemeral public key).
     - `nonce`: base64(nonce).
     - `ciphertext`: base64(ciphertext).

Contract call (`EmailRecoveryService.requestEncryptedEmailVerification`):

- Builds `context: { account_id, payer_account_id, network_id }`.
- Sends to `EmailDKIMVerifier::request_email_verification` with:

```jsonc
{
  "payer_account_id": "<relayerAccountId>",
  "email_blob": null,
  "encrypted_email_blob": { version, ephemeral_pub, nonce, ciphertext },
  "params": { account_id, payer_account_id, network_id }
}
```

### 2.2 EmailDKIMVerifier Contract (Rust)

- File: `email-dkim-verifier-contract/src/tee_verify.rs`

`request_email_verification_private_inner` builds the Outlayer request:

```rust
let input_payload = json!({
    "method": VERIFY_ENCRYPTED_EMAIL_METHOD, // "verify-encrypted-email"
    "params": {
        "encrypted_email_blob": encrypted_email_blob,
        "context": params.unwrap_or_else(|| json!({})),
    },
}).to_string();
```

### 2.3 Outlayer Worker (Rust)

- Crate: `dkim-outlayer`, file: `src/crypto.rs` and `src/api.rs`.

Decryption (`decrypt_encrypted_email`):

- Inputs:
  - `envelope: EncryptedEmailEnvelope` (`ephemeral_pub`, `nonce`, `ciphertext`).
  - `context: serde_json::Value` (the same JSON object from `params.context`).
- Steps:
  1. Load static X25519 secret from `OUTLAYER_WORKER_SK_SEED_HEX32`:
     - HKDF‑SHA256(seed, info = `"outlayer-email-dkim-x25519"`) → 32‑byte static secret.
     - Public key = X25519(static_secret).
  2. Compute shared secret:
     - `shared = static_secret.diffie_hellman(ephemeral_pub)`.
  3. Derive AEAD key with HKDF‑SHA256:
     - `info = "email-dkim-encryption-key"`.
     - `key = HKDF(shared, info)[0..32]`.
  4. Build AAD:
     - `aad = serde_json::to_vec(context)` (raw JSON bytes).
  5. Decrypt with ChaCha20‑Poly1305:
     - `cipher.decrypt(nonce, Payload { msg: &ciphertext, aad: &aad })`.

On failure, it returns `error: "decryption failed"`.

## 3. SDK Test Coverage

New tests ensure the SDK matches the worker’s behavior:

- File: `sdk/src/server/email-recovery/teeEmail.ts`:
  - `deriveOutlayerStaticKeyFromSeedHex(seedHex)`: derives the same static X25519 secret/public key as the worker does from `OUTLAYER_WORKER_SK_SEED_HEX32`.

- File: `sdk/src/__tests__/unit/emailEncryptionOutlayerCompat.test.ts`:

  1. **Synthetic Round‑Trip**:
     - Derive `{ workerSk, workerPk }` from seed:
       - `e4c9a1f3b87d54c2a0fe93d1c6428b7fd2a6c1e89bf7405de318ab94f6c2d07e`.
     - Encrypt a simple email with `recipientPk = workerPk`.
     - Decrypt with `recipientSk = workerSk` via `decryptEmailForOutlayerTestOnly`.
     - Asserts decrypted == original.
     - Also checks derived public key base64 is exactly:
       - `"jSO3s2HFZBZsFUMQIijeilN/lJa6MWmXMafg642/Hhw="`.

  2. **Full Gmail Fixture Round‑Trip**:
     - Uses `sdk/src/__tests__/unit/emails/gmail_reset_full.eml` as `emailRaw`.
     - Same `{ workerSk, workerPk }` from the seed.
     - Asserts the full `.eml` contents round‑trip encrypt→decrypt.

  3. **On‑Chain Envelope Decrypt**:
     - Uses `gmail_reset_full2.eml` as `RAW_EMAIL_FROM_LOGS`, containing the exact email corresponding to a failing on‑chain attempt.
     - Uses `ENVELOPE_FROM_CHAIN` and `CONTEXT_FROM_CHAIN` copied from the Outlayer request logs:
       - `encrypted_email_blob.version`, `ephemeral_pub`, `nonce`, `ciphertext`.
       - `context = { account_id, payer_account_id, network_id }`.
     - Derives `workerSk` from the same seed.
     - Calls `decryptEmailForOutlayerTestOnly({ envelope: ENVELOPE_FROM_CHAIN, context: CONTEXT_FROM_CHAIN, recipientSk: workerSk })`.
     - Asserts decrypted email equals `RAW_EMAIL_FROM_LOGS` (with normalized line endings).

All of these tests pass, which strongly suggests:
- The SDK’s encryption and the worker’s decryption algorithm (as in this repo) are consistent.
- For the seed and envelope/context captured in logs, decryption *should* succeed.

## 4. Where the Bug Likely Is

Since the SDK’s encrypt/decrypt tests succeed even on the exact on‑chain envelope, the remaining `decryption failed` in the live environment must be due to a mismatch in **runtime configuration or deployed code**, not the TypeScript crypto.

Most probable causes:

1. **Worker static key mismatch**
   - The Outlayer instance serving `email-dkim-verifier-v1.testnet` may not be using the same `OUTLAYER_WORKER_SK_SEED_HEX32` as in local tests.
   - Even though `set_outlayer_encryption_public_key` uses `get-public-key` from the worker, there may be:
     - Multiple worker deployments.
     - A different secrets profile or environment for the live worker.
   - Check:
     - Call `get_outlayer_encryption_public_key` on the contract.
     - Base64‑decode it and compare to the public key from `deriveOutlayerStaticKeyFromSeedHex(seed)` in tests.
     - If they differ, the live worker’s static key ≠ the seed we’re testing against.

2. **Using stale envelope/context from before the fix**
   - The failing Outlayer response (`error: "decryption failed"`) might be from a run before:
     - The SDK AAD logic was aligned (`JSON.stringify(context)` vs sorted keys).
     - The worker seed was updated.
   - Subsequent emails (with the new SDK + correct key) may decrypt fine, but older logs still show failures.
   - To debug *current* failures:
     - Capture a new failing run’s `encrypted_email_blob` + `context` from logs.
     - Plug that exact data into `decryptEmailForOutlayerTestOnly` with the same seed and see if it still decrypts.

3. **Different Outlayer worker build than the repo**
   - The deployed worker binary might be an older version using a different:
     - HKDF `info` string, or
     - AAD serialization (e.g., canonicalization, different JSON structure).
   - The repo we’re testing against uses:
     - `info = "email-dkim-encryption-key"` for AEAD key derivation.
     - `serde_json::to_vec(context)` for AAD.
   - A live worker built from an older revision with different parameters will fail to decrypt envelopes produced by the updated SDK, even though local tests (against the new code) pass.

## 5. Next Debugging Steps

To conclusively pinpoint the issue:

1. **Verify live worker key alignment**
   - From the NEAR shell / RPC:
     - Re-run `set_outlayer_encryption_public_key()` on `email-dkim-verifier-v1.testnet`.
     - Call `get_outlayer_encryption_public_key()` and record the base64 public key.
   - In a Node REPL using the built SDK:

   ```ts
   import { deriveOutlayerStaticKeyFromSeedHex } from '@tatchi-xyz/sdk/server';

   const { publicKey } = deriveOutlayerStaticKeyFromSeedHex('OUTLAYER_WORKER_SK_SEED_HEX32');
   const pkB64 = Buffer.from(publicKey).toString('base64');
   console.log(pkB64);
   ```

   - Compare `pkB64` with the contract’s stored public key.
   - If they differ, Outlayer is using a different secret than the one in tests.

2. **Replay a fresh failing envelope**
   - Wait for a fresh `decryption failed` event.
   - Capture:
     - `encrypted_email_blob` (full JSON),
     - `context` from `input_data.params.context`.
   - Run the JS test snippet (or adapt `emailEncryptionOutlayerCompat.test.ts`) against that envelope/context with the current seed.
   - Outcomes:
     - If decrypt **fails** locally: live worker key or AAD logic differs from this repo.
     - If decrypt **succeeds** locally: the error is not crypto but somewhere between Outlayer and the contract (e.g., different code path, wrong params being passed, or a misinterpreted error).

This doc should give enough context for Outlayer/infra owners to reproduce the behavior and check that the deployed worker (binary + secrets) matches the code and seed we’re testing against here.
