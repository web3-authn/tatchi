---
title: YubiKeys and WebAuthn PRF
---

# YubiKey Support

YubiKeys require two touchID prompts for Web3Authn registration flows.

- registration flow needs both (i) PRF outputs to derive deterministic keys, and (ii) registration credentials from `navigator.credentials.create()` for the attestation objects containing COSE public key information.
- Currently browsers only expose PRF results during **authentication** (`navigator.credentials.get()`), not during **registration** (`navigator.credentials.create()`), especially for **roaming authenticators** (security keys like YubiKey).

Therefore YubiKeys will need to call both `navigator.credentials.create()` and `navigator.credentials.get()` during registration.

This is a limitation of roaming authenticators (YubiKeys) as they are not fully supported in browser contexts for Webauthn PRF extension at the moment.


## Browser Behavior with Roaming Authenticators (e.g Yubikey)

`navigator.credentials.create()` returns a registration credential with:
    - `getClientExtensionResults().prf.enabled === true`
    - **No** `prf.results.first/second`.

- `navigator.credentials.get()` with `extensions.prf.eval`:
  - Returns a 32‑byte PRF secret in:
    - `getClientExtensionResults().prf.results.first` (and optionally `second`).

