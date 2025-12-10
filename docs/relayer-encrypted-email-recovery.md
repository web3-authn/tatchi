# Encrypted Email Recovery – Relayer Overview

This document explains how the Web3Authn relayer SDK performs **encrypted email
recovery** using a TEE-based Outlayer worker and the `EmailDKIMVerifier`
contract.

## High-Level Flow

1. User sends a recovery email (e.g. `Subject: recover-<requestId-6digit> <accountId> ed25519:<new_public_key>`).
2. The relayer receives the raw `.eml` (headers + body).
3. The relayer encrypts the email with the Outlayer X25519 public key and
   constructs an `EncryptedEmailEnvelope`.
4. The relayer calls the per-account `EmailRecoverer` contract with:
   - `verify_encrypted_email_and_recover(encrypted_email_blob, aead_context)`, where
     `encrypted_email_blob = envelope` and
     `aead_context = { account_id, network_id, payer_account_id }`.
5. The per-account `EmailRecoverer` delegates to the global
   `EmailDKIMVerifier` contract (which talks to the Outlayer worker) to perform
   DKIM verification and account recovery, and ensures a `VerificationResult`
   is stored keyed by `request_id` for the frontend to poll via
   `get_verification_result(request_id)`.

The goal is that validators and indexers only see ciphertext; the TEE worker
handles plaintext and DKIM verification off-chain.

## SDK Components

- `sdk/src/server/email-recovery/emailEncryptor.ts`
  - `encryptEmailForOutlayer({ emailRaw, context, recipientPk })`:
    - Accepts an X25519 public key (`recipientPk`).
    - Generates an ephemeral X25519 keypair and 12-byte nonce.
    - Derives a symmetric key via HKDF-SHA256.
    - Encrypts `emailRaw` with ChaCha20-Poly1305 using `JSON.stringify(context)` as AEAD AAD.
    - Returns `{ envelope, context }` where:
      ```ts
      type EncryptedEmailEnvelope = {
        version: 1;
        ephemeral_pub: string;
        nonce: string;
        ciphertext: string;
      };
      ```

- `sdk/src/server/email-recovery/index.ts` (`EmailRecoveryService`)
  - `verifyEncryptedEmailAndRecover({ accountId, emailBlob })`:
    - Validates inputs.
    - Fetches and caches the Outlayer X25519 public key via
      `get_outlayer_encryption_public_key` on the global `EmailDKIMVerifier`.
    - Calls `encryptEmailForOutlayer` with AEAD context
      `{ account_id: accountId, network_id: networkId, payer_account_id: relayerAccountId }`
      to produce `encrypted_email_blob`.
    - Sends `verify_encrypted_email_and_recover` to the per-account
      `EmailRecoverer` contract with:
      `{ encrypted_email_blob: envelope, aead_context: context }`.
    - Returns an `EmailRecoveryResult`:
      ```ts
      {
        success: boolean;
        transactionHash?: string;
        message?: string;
        error?: string;
      }
      ```

## Using Email Recovery from a Relayer

From an HTTP route or worker:

```ts
const result = await authService.emailRecovery?.verifyEncryptedEmailAndRecover({
  accountId,         // parsed from Subject / headers
  emailBlob,         // full raw .eml as UTF-8
});
```

- On success:
  - `result.success === true`
  - `result.transactionHash` contains the NEAR transaction hash that triggered
    DKIM verification and recovery.
- On failure:
  - `result.success === false`
  - `result.error` / `result.message` contain a human-readable error string
    (init failure, contract error, etc.).

For multi-mode setups (ZK / encrypted / on-chain), use
`EmailRecoveryService.requestEmailRecovery` instead and let the body marker
(`zk-email | tee-encrypted | onchain-public`, also accepting legacy `encrypted` / `tee` as aliases for `tee-encrypted`) select the path.
