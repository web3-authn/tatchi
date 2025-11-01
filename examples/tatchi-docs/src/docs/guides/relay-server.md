---
title: Relay Server
---

# Relay Server

Run the relay (AuthService) on Node/Express. The relay exposes endpoints the SDK uses for account creation, Shamir 3‑pass (VRF wrap/unwrap), and simple health checks. For Cloudflare’s runtime, see the Cloudflare Worker guide.

## When to use the relay

- Registration: atomically create an account and register a passkey
- Login UX: unlock the VRF key with Shamir 3‑pass (no TouchID) when possible
- Rotation: publish the current server keyId and accept a short grace list while clients refresh

## Project layout (Express)

- Source: `examples/relay-server/`
- Entrypoint: `src/index.ts`
- Config: `.env`

The server constructs an `AuthService` and mounts the standard Express router:

```ts
import express from 'express'
import cors from 'cors'
import { AuthService } from '@tatchi-xyz/sdk/server'
import { createRelayRouter } from '@tatchi-xyz/sdk/server/router/express'

const app = express()
app.use(express.json())
app.use(cors({ origin: [EXPECTED_ORIGIN, EXPECTED_WALLET_ORIGIN], credentials: true }))

const service = new AuthService({
  relayerAccountId: process.env.RELAYER_ACCOUNT_ID!,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
  webAuthnContractId: process.env.WEBAUTHN_CONTRACT_ID || 'w3a-v1.testnet',
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  networkId: 'testnet',
  accountInitialBalance: '30000000000000000000000',
  createAccountAndRegisterGas: '85000000000000',
  shamir: {
    shamir_p_b64u: process.env.SHAMIR_P_B64U!,
    shamir_e_s_b64u: process.env.SHAMIR_E_S_B64U!,
    shamir_d_s_b64u: process.env.SHAMIR_D_S_B64U!,
    graceShamirKeysFile: process.env.SHAMIR_GRACE_KEYS_FILE, // optional JSON path
  },
})

app.use('/', createRelayRouter(service, { healthz: true }))
app.listen(3000)
```

## API Endpoints

### Create account + register

`POST /create_account_and_register_user`

Atomically creates a NEAR account and registers the authenticator on‑chain.

- Request (abridged)
```json
{ "new_account_id": "alice.testnet", "new_public_key": "ed25519:…",
  "webauthn_registration": { /* attestation + PRF proof */ },
  "deterministic_vrf_public_key": "ed25519:…", "vrf_data": { /* salts */ } }
```
- Response
```json
{ "success": true, "transactionHash": "..." }
```

### Shamir 3‑pass (strict keyId)

`POST /vrf/apply-server-lock`
```json
{ "kek_c_b64u": "base64url" }
```
→ `{ "kek_cs_b64u": "base64url", "keyId": "sha256_of_e_s_b64u_b64url" }`

`POST /vrf/remove-server-lock`
```json
{ "kek_cs_b64u": "base64url", "keyId": "sha256_of_e_s_b64u_b64url" }
```
→ `{ "kek_c_b64u": "base64url" }`

`GET /shamir/key-info`
```json
{ "currentKeyId": "…", "p_b64u": "…", "graceKeyIds": ["…"] }
```

### cURL examples

Apply server lock:
```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"kek_c_b64u":"<client-locked-kek>"}' \
  https://relay.example.com/vrf/apply-server-lock
```

Remove server lock:
```bash
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"kek_cs_b64u":"<client-then-server-locked>","keyId":"<sha256_of_e_s_b64u_b64url>"}' \
  https://relay.example.com/vrf/remove-server-lock
```

Key info:
```bash
curl https://relay.example.com/shamir/key-info
```

## Rotation helpers (no extra routes required)

Use `AuthService` directly for rotation and grace list management from an internal timer/cron:

```ts
const result = await service.rotateShamirServerKeypair({ keepCurrentInGrace: true })
console.log(result.newKeyId, result.graceKeyIds)
// Persist result.newKeypair.{e_s_b64u,d_s_b64u} in your secret store.
```

The example server includes a minimal interval that rotates every `ROTATE_EVERY` minutes and trims grace to the last 5 keys.

## Configuration (.env)

```bash
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:…
NEAR_RPC_URL=https://test.rpc.fastnear.com
WEBAUTHN_CONTRACT_ID=w3a-v1.testnet
EXPECTED_ORIGIN=http://localhost:5173
EXPECTED_WALLET_ORIGIN=https://wallet.example.localhost

# Shamir 3‑pass
SHAMIR_P_B64U=…
SHAMIR_E_S_B64U=…
SHAMIR_D_S_B64U=…
# Optional: where to persist grace keys between restarts
SHAMIR_GRACE_KEYS_FILE=./grace-keys.json

# Optional: minutes between automatic rotations
ROTATE_EVERY=60
```

## Security notes

- `keyId` is required for `/vrf/remove-server-lock` and deterministically selects a single key.
- Grace keys are used only for removing the lock; new locks always use the current key.
- Keep the grace window short and prune old keys after clients refresh.

## Cloudflare variant

To run the relay on Cloudflare Workers (no filesystem, WASM bundled):
- Follow [Cloudflare Worker](/docs/guides/cloudflare-worker) for WASM bundling and environment setup
- Pass signer and Shamir WASM via config (`moduleOrPath`), since `import.meta.url` is unavailable in Workers
