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

The SDK refreshes stored blobs after success and proactively migrates to the current server key when possible. See also the [SDK flow notes](https://github.com/web3-authn/sdk/blob/main/sdk/docs/shamir3pass-login.md).

## Server endpoints (relay)

- POST `/vrf/apply-server-lock` — add server lock to client‑blinded KEK
- POST `/vrf/remove-server-lock` — peel server lock from client‑blinded KEK

The server never sees the KEK or VRF plaintext; it only operates on blinded values.

## Data storage (client)

- `ciphertextVrfB64u`: VRF key wrapped under AEAD with the KEK
- `kek_s_b64u`: KEK with the server’s lock applied
- `p_version`: identifier for public modulus parameters

## Rotation & Key Maintenance

When the relay rotates its Shamir3Pass server exponents `(e_s, d_s)`, auto‑login blobs need to migrate to the new key. The SDK handles this automatically.

Data model (IndexedDB)
- `ciphertextVrfB64u`: AEAD ciphertext over the VRF keypair bytes
- `kek_s_b64u`: server‑locked KEK (client lock already removed)
- `serverKeyId`: identifier for the server key used to lock the KEK (sha256 of `e_s_b64u`, base64url)
- `updatedAt`: ms since epoch (used for diagnostics/migrations)

Client behavior
- Primary (no TouchID): try Shamir unlock using `{ ciphertextVrfB64u, kek_s_b64u, serverKeyId }`
- Fallback: on failure, unlock via TouchID/PRF, then immediately re‑encrypt under the current server key and persist
- Proactive refresh: after any successful Shamir unlock, fetch `GET /shamir/key-info`; if `currentKeyId !== serverKeyId`, re‑encrypt the in‑memory VRF keypair under the new key and update IndexedDB

Relay API (strict keyId)
- `POST /vrf/apply-server-lock` → `{ kek_cs_b64u, keyId }` (keyId is sha256(e_s_b64u))
- `POST /vrf/remove-server-lock` with `{ kek_cs_b64u, keyId }` (required) → `{ kek_c_b64u }`
- `GET /shamir/key-info` → `{ currentKeyId, p_b64u, graceKeyIds }`

Strict keyId mode
- Server requires `keyId` on remove‑lock and deterministically selects the active key or a grace key
- Client/WASM requires and stores `serverKeyId`; Shamir auto‑unlock is only attempted when present

Rotating in production — checklist
1) Verify `GET /shamir/key-info` returns `currentKeyId`
2) Rotate: `rotateShamirServerKeypair({ keepCurrentInGrace: true, persistGraceToDisk: true })`
3) Clients migrate: proactive refresh after successful Shamir unlock; otherwise refresh after TouchID fallback
4) Monitor: track `unknown keyId` errors; ensure new `keyId` appears in apply‑lock responses
5) Prune: remove grace keys after the window

Read next: [Nonce Manager](/docs/concepts/nonce-manager)
