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

