---
title: Shamir3Pass
---

# Shamir3Pass

Optional login UX: unlock the VRF keypair without TouchID by collaborating with the relay server using commutative encryption over a public modulus.

## Security properties

- Server never learns the VRF private key or the KEK (key‑encryption‑key)
- AEAD protects the wrapped VRF key at rest
- Strict `keyId` selection avoids ambiguity during server key rotation

## Flows

Registration
1) Client derives/creates VRF keypair
2) Client locks VRF with random KEK (AEAD) → ciphertext
3) Server adds its lock to KEK → `kek_s`
4) Client stores `{ ciphertext, kek_s, serverKeyId }` in IndexedDB

Login
1) Client adds a one‑time lock to `kek_s` → `kek_st`
2) Server removes its lock → `kek_t`
3) Client removes the one‑time lock → KEK
4) Client decrypts ciphertext → VRF keypair in memory

The SDK refreshes stored blobs after success and proactively migrates to the current server key when possible. See also [Shamir3Pass Rotation](./shamir3pass-rotate-keys) and the [SDK flow notes](https://github.com/web3-authn/sdk/blob/main/sdk/docs/shamir3pass-login.md).
