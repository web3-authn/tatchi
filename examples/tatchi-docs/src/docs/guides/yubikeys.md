---
title: YubiKeys and WebAuthn PRF
---

# YubiKey Support

YubiKeys work with Web3Authn, but **registration requires two passkey prompts** (two Touch ID / security‑key taps) instead of one. This is expected and only applies to roaming authenticators (like YubiKeys); platform passkeys still use a single prompt.

## Why Two Prompts Are Needed

The registration flow needs two things from the authenticator:

1. **WebAuthn registration payload**  
   - Comes from `navigator.credentials.create()`.  
   - Contains attestation data and the COSE public key (`attestationObject`), which the contract stores and uses to verify future assertions.

2. **WebAuthn PRF outputs**  
   - Web3Authn derives deterministic VRF + NEAR keys from the WebAuthn PRF extension.  
   - Many browsers only expose PRF **results** during **authentication** (`navigator.credentials.get()`), not during **registration** (`navigator.credentials.create()`), especially for roaming authenticators like YubiKeys.

To handle this, the SDK does:

1. Call `navigator.credentials.create()`  
   - Collects the registration credential (COSE public key + attestation).  
   - This is what gets sent to the Web3Authn contract for `webauthn_registration`.

2. Immediately call `navigator.credentials.get()` bound to the **same credential**  
   - Uses `allowCredentials` with the `rawId` from the registration step.  
   - Requests `prf.eval.first/second` using salts derived from the NEAR account ID.  
   - Extracts `getClientExtensionResults().prf.results.first/second` and uses those PRF outputs to derive and encrypt deterministic VRF + NEAR keypairs.

That means YubiKey users will see:

- **First prompt** – creating the passkey (registration).  
- **Second prompt** – authenticating once more to produce PRF outputs for key derivation.

On future logins and transactions, only the usual **single `navigator.credentials.get()` prompt** is used; the extra prompt happens only once at registration.


## Browser Behavior With Roaming Authenticators

In practice, for many YubiKey + browser + OS combinations:

- `navigator.credentials.create()` returns a registration credential where:
  - `getClientExtensionResults().prf.enabled === true`
  - **No** `prf.results.first/second` are present.

- `navigator.credentials.get()` with `extensions.prf.eval`:
  - Returns a 32‑byte PRF secret in:
    - `getClientExtensionResults().prf.results.first` (and optionally `second`).

The SDK’s two‑prompt registration is exactly aligning with this behavior:

- **create()** → we get the permanent credential and COSE public key for the contract.  
- **get()** → we obtain the PRF outputs that browsers currently only expose on authentication, and use them to derive deterministic wallet keys.

This preserves security (one credential controls both contract and key derivation) while working around PRF‑on‑create limitations for roaming authenticators.

## YubiKey Backup (Single Device)

Use a YubiKey as a physical backup for an existing account without a second device or QR flow.

### High-Level Flow

1) **Register the YubiKey**
   - Call `navigator.credentials.create()` with the wallet RP ID and user derived from `accountId`.
   - Immediately follow with `navigator.credentials.get()` constrained to the new credential ID to obtain PRF outputs.

2) **Derive deterministic keys**
   - Use PRF outputs to derive the deterministic VRF keypair and NEAR ed25519 keypair scoped to the same `accountId`.
   - Encrypt and store these in IndexedDB (same as standard registration).

3) **Register the authenticator on-chain**
   - Call the contract’s link-device style method (e.g., `link_device_register_user`) with:
     - `vrf_data` from the YubiKey’s deterministic VRF public key and a fresh VRF challenge.
     - `webauthn_registration` from the YubiKey registration credential.

4) **Add the NEAR public key**
   - Use the logged-in platform passkey to send an `add_key` transaction for the YubiKey’s deterministic NEAR public key.

### Result

The same account now supports both:

- The original platform passkey, and
- The YubiKey (as an additional authenticator + NEAR key)
