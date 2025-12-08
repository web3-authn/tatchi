# Encrypted Email Recovery – Relayer Overview

This document explains how the Web3Authn relayer SDK performs **encrypted email
recovery** using a TEE-based Outlayer worker and the `EmailDKIMVerifier`
contract.

## High-Level Flow

1. User sends a recovery email (e.g. `Subject: recover <accountId> ed25519:<new_public_key>`).
2. The relayer receives the raw `.eml` (headers + body).
3. The relayer encrypts the email with the Outlayer X25519 public key and
   constructs an `EncryptedEmailEnvelope`.
4. The relayer calls `EmailDKIMVerifier::request_email_verification` with:
   - `email_blob = null`
   - `encrypted_email_blob = envelope`
   - `params = { account_id, payer_account_id, network_id }`.
5. The Outlayer worker decrypts, verifies DKIM, and the contract returns a
   `VerificationResult` with the recovered fields.

The goal is that validators and indexers only see ciphertext; the TEE worker
handles plaintext and DKIM verification off-chain.

## SDK Components

- `sdk/src/server/email-recovery/teeEmail.ts`
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
  - `requestEncryptedEmailVerification({ accountId, emailBlob })`:
    - Validates inputs.
    - Builds `context`:
      ```ts
      {
        account_id: accountId,
        payer_account_id: relayerAccountId,
        network_id: networkId,
      }
      ```
    - Fetches and caches the Outlayer X25519 public key via `get_outlayer_encryption_public_key`.
    - Calls `encryptEmailForOutlayer` to produce `encrypted_email_blob`.
    - Sends `request_email_verification` to `EmailDKIMVerifier` with:
      `{ payer_account_id, email_blob: null, encrypted_email_blob: envelope, params: context }`.
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
const result = await authService.emailRecovery?.requestEncryptedEmailVerification({
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
(`zk-email | encrypted | onchain-public`) select the path.
