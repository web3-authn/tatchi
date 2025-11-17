---
title: Shamir 3-Pass Protocol
---

# Shamir 3-Pass Protocol

Shamir 3-pass is an optional protocol that improves login UX without giving the server access to secrets.

## The problem it solves

Without Shamir 3-pass, unlocking the VRF keypair always requires a WebAuthn ceremony (TouchID/FaceID). This is secure but can feel heavy if users log in frequently.

## The solution

With Shamir 3-pass:

1. The VRF keypair is encrypted under a random key-encryption-key (KEK)
2. The server applies its own "lock" to the KEK using commutative encryption
3. Later, client and server cooperate to remove locks
4. The client recovers the KEK without the server ever seeing it

After a successful Shamir unlock, the VRF key stays in worker memory for the session. Later operations need only a single biometric prompt each, instead of one for unlocking + one for signing.

## Registration with Shamir

**1. Generate and encrypt the VRF keypair**

```ts
const vrfKeypair = generateVrfKeypair()
const kek = randomBytes(32)
const ciphertext = aead_encrypt(vrfKeypair, kek)
```

**2. Blind the KEK with a client lock**

```ts
const kek_c = clientBlind(kek)
```

**3. Ask server to apply its lock**

```ts
POST /vrf/apply-server-lock
{ "kek_c_b64u": base64url(kek_c) }

’ { "kek_cs_b64u": base64url(kek_cs), "keyId": "..." }
```

**4. Remove client blind**

```ts
const kek_s = removeClientBlind(kek_cs)
```

**5. Store encrypted data**

```ts
IndexedDB.put({
  ciphertextVrfB64u: base64url(ciphertext),
  kek_s_b64u: base64url(kek_s),
  serverKeyId: keyId
})
```

Now the VRF keypair is encrypted under `kek`, and `kek_s` can only be unlocked with server cooperation.

## Login with Shamir

**1. Load stored data**

```ts
const { ciphertextVrfB64u, kek_s_b64u, serverKeyId } = IndexedDB.get()
```

**2. Add a one-time client lock**

```ts
const kek_st = addClientLock(kek_s)
```

**3. Ask server to remove its lock**

```ts
POST /vrf/remove-server-lock
{ "kek_st_b64u": base64url(kek_st), "keyId": serverKeyId }

’ { "kek_t_b64u": base64url(kek_t) }
```

**4. Remove client lock to recover KEK**

```ts
const kek = removeClientLock(kek_t)
```

**5. Decrypt VRF keypair**

```ts
const vrfKeypair = aead_decrypt(ciphertext, kek)
```

Now the VRF keypair is loaded in worker memory, ready for signing.

## Fallback and key rotation

**If Shamir unlock fails:**

The SDK falls back to PRF-based WebAuthn unlock:

1. Prompt for biometric authentication
2. Use PRF output to decrypt the VRF keypair
3. Re-wrap under the current server key
4. Update IndexedDB

**Key rotation:**

Servers periodically rotate their Shamir keypair `(e_s, d_s)`:

```ts
const result = await service.rotateShamirServerKeypair({
  keepCurrentInGrace: true
})
```

The SDK handles rotation transparently:

1. After unlock, check `GET /shamir/key-info` for `currentKeyId`
2. If different from stored `serverKeyId`, re-wrap and update
3. Old keys are kept in a grace list temporarily for migration
4. Clients automatically migrate to new keys on next login

**Key takeaway:** Shamir 3-pass gives session-like UX (fewer biometric prompts) without leaking VRF keys to the server.

## Related

- [VRF Challenges](vrf-challenges) - Learn how VRF keypairs are used for challenge construction
- [Security Model](security-model) - Understand the broader security architecture
