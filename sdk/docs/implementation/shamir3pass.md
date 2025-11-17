# Shamir 3-Pass: Implementation Specification

Complete implementation guide for Shamir 3-pass VRF key encryption, login flow, and server key rotation.

## Overview

Shamir 3-pass enables TouchID-free login by storing an encrypted VRF keypair that can be decrypted with relay server cooperation. The server never sees the plaintext VRF key or key-encryption key (KEK), only blinded values during commutative encryption.

**Security properties:**
- Server never learns KEK or VRF key
- Single public modulus `p` (no modulus mismatch)
- AEAD provides confidentiality and integrity for wrapped VRF keypair
- Only blinded KEK values transmitted

**Commutative encryption property:**
```
Enc_B(Enc_A(msg)) == Enc_A(Enc_B(msg))
```

## Technical Solution

Commutative exponentiation over a safe prime `p` for a random KEK `K` that wraps the VRF keypair via AEAD.

### Registration Flow

1. Client generates random KEK
2. Client encrypts VRF keypair with KEK → `vrf_ciphertext`
3. Client requests server to add lock to KEK → `KEK_s`
4. Client stores `{ vrf_ciphertext, KEK_s, serverKeyId }` in IndexedDB

**Code**: `sdk/src/wasm_vrf_worker/src/handlers/handle_derive_vrf_keypair_from_prf.rs:84`

### Login Flow

1. Client loads `{ vrf_ciphertext, KEK_s, serverKeyId }`
2. Client adds one-time lock to `KEK_s` → `KEK_st`
3. Client sends `{ KEK_st, serverKeyId }` to server
4. Server decrypts `KEK_st` → `KEK_t` and returns it
5. Client removes one-time lock on `KEK_t` to reveal `KEK`
6. Client uses `KEK` to decrypt `vrf_ciphertext`

**Security**: Server never sees VRF key plaintext or KEK, only blinded `KEK_st`.

**Code**: `sdk/src/core/TatchiPasskey/login.ts:155` and `:240`

### Proactive Refresh

After successful Shamir unlock:
1. Manager fetches `GET /shamir/key-info`
2. Compares `currentKeyId` to stored `serverKeyId`
3. If different and VRF session active, re-encrypts in-memory VRF keypair under new key
4. Updates IndexedDB with new `{ kek_s_b64u, serverKeyId }`

**Code**: `sdk/src/core/WebAuthnManager/index.ts:459`

## Public Parameters

- **Prime `p`**: 2048-bit safe prime, hardcoded in both client WASM and server
- **Generator `g`**: 2 (standard generator)

## Data Model

### Client (IndexedDB)

`serverEncryptedVrfKeypair` fields per user:

```typescript
{
  ciphertextVrfB64u: string,  // AEAD ciphertext over VRF keypair bytes
  kek_s_b64u: string,          // Server-locked KEK (client lock removed)
  serverKeyId: string,         // sha256(e_s_b64u), base64url
  updatedAt: number            // Milliseconds since epoch
}
```

**Types**: `sdk/src/core/types/vrf-worker.ts:132`, `sdk/src/core/IndexedDBManager/passkeyClientDB.ts:33`

### WASM VRF Worker Handlers

**`DERIVE_VRF_KEYPAIR_FROM_PRF`**: Derives VRF keypair from PRF; when server URLs configured, performs Shamir client encrypt and returns `serverEncryptedVrfKeypair`.

**Code**: `sdk/src/wasm_vrf_worker/src/handlers/handle_derive_vrf_keypair_from_prf.rs:84`

**`SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR`**: Encrypts currently unlocked VRF keypair, returns `{ ciphertextVrfB64u, kek_s_b64u, serverKeyId }`.

**Code**: `sdk/src/wasm_vrf_worker/src/handlers/handle_shamir3pass_client.rs:18` and `:77`

**`SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR`**: Shamir unlock + decrypt; requires `keyId` (strict mode) to select correct server key.

**Code**: `sdk/src/wasm_vrf_worker/src/handlers/handle_shamir3pass_client.rs:25` and `:151`

### HTTP Types (Strict keyId Mode)

**Apply server lock response:**
```typescript
{ kek_cs_b64u: string, keyId?: string }
```

**Remove server lock request:**
```typescript
{ kek_st_b64u: string, keyId: string }  // keyId required
```

**Code**: `sdk/src/wasm_vrf_worker/src/http.rs`, `sdk/src/wasm_vrf_worker/src/types/http.rs`

## Relay Server API

### POST /vrf/apply-server-lock

**Request:**
```json
{ "kek_c_b64u": "..." }
```

**Response:**
```json
{
  "kek_cs_b64u": "...",
  "keyId": "sha256-of-active-e_s-base64url"
}
```

### POST /vrf/remove-server-lock

**Request:**
```json
{
  "kek_st_b64u": "...",
  "keyId": "..."  // Required
}
```

**Response:**
```json
{ "kek_t_b64u": "..." }
```

**Errors**: `400` if `keyId` missing or unknown.

### GET /shamir/key-info

**Response:**
```json
{
  "currentKeyId": "...",
  "p_b64u": "...",
  "graceKeyIds": ["...", "..."]
}
```

**References**: `examples/relay-server/src/index.ts:84`, `sdk/src/server/core/AuthService.ts:954`

## Server Key Rotation

### Rotation API

**`AuthService.rotateShamirServerKeypair({ keepCurrentInGrace?: true, persistGraceToDisk?: true })`**

Swaps in fresh keypair, retains previous key as grace key.

**Code**: `sdk/src/server/core/AuthService.ts:416`

**`AuthService.generateShamirServerKeypair()`**

Previews new pair without swapping.

**Code**: `sdk/src/server/core/AuthService.ts:390`

### Grace Keys

Server maintains map of grace keys; only used for `remove-server-lock` (unwrap) when `keyId` matches a grace entry.

Grace set persisted to `grace-keys.json` (configurable), exposed via admin helpers.

**Code**: `AuthService` grace load/persist helpers around `:240–360` and `:1088–1139`

## Strict keyId Mode (Enforced)

### Server

- `remove-server-lock` requires `keyId`, deterministically selects active or matching grace key; responds `400` otherwise
- `apply-server-lock` includes `keyId` so clients can tag stored blobs

### WASM/Client

- Remove-lock request types require `keyId` end-to-end
- `ServerEncryptedVrfKeypair.serverKeyId` required client-side
- Shamir auto-unlock attempted only when present, otherwise SDK uses TouchID and refreshes

## Security Notes

- Server never sees plaintext VRF or KEK; only blinded KEKs (`kek_c`, `kek_cs`)
- `keyId` prevents ambiguous key selection after rotations
- Grace keys allow short migration windows; prefer trimming grace list quickly once clients refresh

## Production Rotation Checklist

### Prepare

1. Persist `SHAMIR_P_B64U`, `SHAMIR_E_S_B64U`, `SHAMIR_D_S_B64U` in secure store
2. Boot service, verify `GET /shamir/key-info` returns `currentKeyId`

### Rotate

```typescript
const result = await authService.rotateShamirServerKeypair({
  keepCurrentInGrace: true,
  persistGraceToDisk: true
})

// Persist returned keypair to secret store
await secretStore.set('SHAMIR_E_S_B64U', result.newKeypair.e_s_b64u)
await secretStore.set('SHAMIR_D_S_B64U', result.newKeypair.d_s_b64u)
```

### Client Migration

- Clients include `serverKeyId` in stored blobs and remove-lock requests automatically
- After rotation, clients either:
  - Proactively refresh (if VRF session active)
  - Refresh after TouchID fallback

### Monitor

- `GET /shamir/key-info` shows active `currentKeyId` and `graceKeyIds`
- Track 400 "unknown keyId" on `/vrf/remove-server-lock` (should drop to zero during grace window)
- Verify new `keyId` appears on `/vrf/apply-server-lock` responses

### Prune

After grace window:
- Remove old keys: `handleRemoveGraceKey({ keyId })` or delete from `grace-keys.json`
- Keep grace set small (example server trims to 5)

### Automate (Optional)

Use example server's scheduler via `ROTATE_EVERY` minutes:

```typescript
startKeyRotationCronjob({
  rotateEvery: 60,  // minutes
  authService,
  onRotate: async (newKeypair) => {
    await secretStore.set('SHAMIR_E_S_B64U', newKeypair.e_s_b64u)
    await secretStore.set('SHAMIR_D_S_B64U', newKeypair.d_s_b64u)
  }
})
```

## UX Flow

### Registration
1. Client generates VRF keypair
2. Encrypts with random KEK (AEAD-based)
3. Sends KEK to server which applies lock → `KEK_cs` (double encrypted)
4. Client unlocks own layer, stores server-locked `KEK_s` locally

### Login
1. Client adds temporary lock to stored `KEK_s` → `KEK_st`
2. Sends to server
3. Server removes its lock → `KEK_t`
4. Client removes temporary lock to recover `KEK`
5. Decrypts VRF keypair with `KEK`

## Client Behavior Summary

**Registration/Derivation**: Worker derives deterministic VRF keypair from PRF, optionally generates VRF challenge. If relay configured, performs Shamir client encrypt, calls `/vrf/apply-server-lock`, persists result to IndexedDB.

**Login Path**: Attempts Shamir unlock first (no TouchID). On success, ensures VRF session active, runs `maybeProactiveShamirRefresh`. On failure, falls back to TouchID unlock (PRF-based decrypt), immediately re-encrypts under current server key, persists.

**Proactive Refresh**: After successful Shamir unlock, fetches `/shamir/key-info`, compares `currentKeyId` to stored `serverKeyId`. If different and VRF session active, re-encrypts in-memory VRF keypair under new key, updates IndexedDB.
