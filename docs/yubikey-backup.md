# YubiKey Backup Flow (Single Device)

This document describes how to treat a YubiKey as a **physical backup** for an existing Web3Authn account, using a single logged‑in device (no QR or second device required).

The goal is:

- You are logged in as `accountId` on device 1 (platform passkey).
- You plug in a YubiKey.
- You run a “link YubiKey backup” flow.
- Afterward, you can use **either**:
  - the original passkey, or
  - the YubiKey
  
to authenticate and sign transactions for the **same** NEAR account.

## High-Level Flow

All of this happens while device 1 is logged in to `accountId`.

1. **WebAuthn registration on the YubiKey (create + get)**
   - Call `navigator.credentials.create()` with:
     - `rp.id` = wallet RP ID (`example.localhost` or your production domain).
     - `user.id` / `user.name` derived from `accountId` (same strategy as regular registration).
     - `extensions.prf` enabled.
   - This yields a **registration credential** with:
     - Attestation object + COSE public key.
     - Credential ID (`id` / `rawId`).
   - Immediately follow with a constrained `navigator.credentials.get()`:
     - `allowCredentials` contains only this `rawId`.
     - `extensions.prf.eval.first/second` use salts derived from `accountId`.
   - Extract dual PRF outputs from `get()`:
     - `prf.results.first` → ChaCha20 PRF output.
     - `prf.results.second` → Ed25519 PRF output.

2. **Derive deterministic keys for the YubiKey**
   - Using the PRF outputs and `accountId`:
     - Derive a **deterministic VRF keypair** scoped to `accountId`.
     - Derive a **deterministic NEAR ed25519 keypair** scoped to `accountId`.
   - Encrypt and store these keys in the wallet’s IndexedDB, just like normal registration.

3. **Register the YubiKey authenticator on the contract**
   - Call the contract’s **link‑device style** method (e.g. `link_device_register_user`) with:
     - `vrf_data` built from the YubiKey’s deterministic VRF public key and a fresh VRF challenge.
     - `webauthn_registration` = the registration credential from `navigator.credentials.create()`.
     - `authenticator_options` = origin policy + userVerification (same as normal registration).
   - The contract:
     - Verifies VRF data and WebAuthn attestation.
     - Stores the new authenticator under `accountId`:
       - Credential ID → COSE public key, transports, origin policy.
       - VRF public keys (bootstrap + deterministic).

4. **Add the YubiKey’s NEAR public key to the account**
   - Using the logged‑in platform passkey session for `accountId`, send an `add_key` transaction:
     - `public_key` = the YubiKey’s deterministic NEAR public key.
     - Access type as per your policy (full access or function‑call).
   - After this transaction lands:
     - `accountId` has a new NEAR key controlled by the YubiKey.
     - The contract already knows the YubiKey authenticator (from step 3).

5. **Result**
   - The same account (`accountId`) now has:
     - Original platform passkey + NEAR keys.
     - A YubiKey authenticator with:
       - Stored COSE public key and transports.
       - VRF public keys.
       - A NEAR key registered on‑chain via `add_key`.
   - Login and transaction signing work with either authenticator; the contract verifies:
     - VRF data using the VRF public key for `accountId`.
     - WebAuthn authentication using the stored COSE key.
     - NEAR signature using the corresponding NEAR public key.

## UX Considerations

- **Two prompts at YubiKey registration time**:
  - First prompt: `navigator.credentials.create()` to register the passkey.
  - Second prompt: `navigator.credentials.get()` to obtain PRF outputs for key derivation.
  - This happens once when linking the YubiKey; subsequent logins/transactions use the normal single‑prompt `get()` flow.

- **Single device only**:
  - Unlike the QR‑based device‑linking feature, this flow does not require a second device or a temporary keypair.
  - It reuses the same account and session on device 1, treating the YubiKey as an additional authenticator plus an additional account key.

