---
title: Relay Server Deployment
---

# Relay Server Deployment

The relay server is an optional backend service that enables account creation, improves login UX, and manages key rotation. This guide covers deployment to both Node.js/Express and Cloudflare Workers.

## When You Need a Relay Server

The relay server handles three main responsibilities:

### 1. Account Creation

Creates NEAR accounts atomically with passkey registration. Without a relay, users would need to:
1. Create a NEAR account separately
2. Fund it
3. Then register their passkey

The relay combines these into a single operation with a better UX.

### 2. Shamir 3-Pass (Smooth Login)

Enables logging in without biometric prompts for returning users. The relay cooperates with the client to unlock the VRF key using Shamir 3-pass protocol, giving a session-like experience while keeping secrets client-side.

Without this, every login requires TouchID/FaceID even for recently active users.

### 3. Key Rotation

Publishes the current server key ID and maintains a grace period for old keys while clients migrate. This allows you to rotate Shamir keys without breaking existing sessions.

**Can you skip the relay?** Yes, if you:
- Don't need atomic account creation (users create accounts separately)
- Accept requiring biometric auth on every login
- Don't use Shamir 3-pass at all

For most production deployments, the relay significantly improves UX.

---

## Deployment Options

Choose based on your infrastructure:

| Platform | Best For | Key Benefits |
|----------|----------|--------------|
| **Express/Node.js** | Traditional hosting, existing Node infrastructure | Familiar stack, filesystem access, easy local dev |
| **Cloudflare Workers** | Serverless, global edge deployment | Auto-scaling, low latency, no server management |

Both platforms expose the same API and work identically from the client's perspective.

---

## Option 1: Express/Node.js

### Project Setup

**Location**: `examples/relay-server/`

**Structure**:
```
relay-server/
├── src/
│   └── index.ts          # Express server entry point
├── .env                  # Configuration
└── package.json
```

### Implementation

```typescript
import express from 'express'
import cors from 'cors'
import { AuthService } from '@tatchi-xyz/sdk/server'
import { createRelayRouter } from '@tatchi-xyz/sdk/server/router/express'

const app = express()
app.use(express.json())
app.use(cors({
  origin: [
    process.env.EXPECTED_ORIGIN,
    process.env.EXPECTED_WALLET_ORIGIN
  ],
  credentials: true
}))

// Initialize the authentication service
const service = new AuthService({
  relayerAccountId: process.env.RELAYER_ACCOUNT_ID!,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
  webAuthnContractId: process.env.WEBAUTHN_CONTRACT_ID || 'w3a-v1.testnet',
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  networkId: 'testnet',
  accountInitialBalance: '30000000000000000000000', // 0.03 NEAR
  createAccountAndRegisterGas: '85000000000000',
  shamir: {
    shamir_p_b64u: process.env.SHAMIR_P_B64U!,
    shamir_e_s_b64u: process.env.SHAMIR_E_S_B64U!,
    shamir_d_s_b64u: process.env.SHAMIR_D_S_B64U!,
    graceShamirKeysFile: process.env.SHAMIR_GRACE_KEYS_FILE, // optional
  },
})

// Mount relay endpoints
app.use('/', createRelayRouter(service, { healthz: true }))
app.listen(3000, () => {
  console.log('Relay server listening on port 3000')
})
```

### Configuration

Create a `.env` file:

```bash
# NEAR Configuration
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
NEAR_RPC_URL=https://test.rpc.fastnear.com
WEBAUTHN_CONTRACT_ID=w3a-v1.testnet

# CORS
EXPECTED_ORIGIN=http://localhost:5173
EXPECTED_WALLET_ORIGIN=https://wallet.example.localhost

# Shamir 3-pass Keys
SHAMIR_P_B64U=...                    # Public modulus
SHAMIR_E_S_B64U=...                  # Server encryption key
SHAMIR_D_S_B64U=...                  # Server decryption key

# Optional: Persist grace keys between restarts
SHAMIR_GRACE_KEYS_FILE=./grace-keys.json

# Optional: Auto-rotation interval (minutes)
ROTATE_EVERY=60
```

### Key Rotation

Add rotation logic with a timer:

```typescript
// Rotate every hour, keep last 5 keys in grace period
setInterval(async () => {
  const result = await service.rotateShamirServerKeypair({
    keepCurrentInGrace: true
  })

  console.log('Rotated to new key:', result.newKeyId)
  console.log('Grace keys:', result.graceKeyIds)

  // Persist new keypair to your secret store
  await saveToSecretStore({
    e_s_b64u: result.newKeypair.e_s_b64u,
    d_s_b64u: result.newKeypair.d_s_b64u
  })
}, 60 * 60 * 1000)
```

### Running Locally

```bash
cd examples/relay-server
pnpm install
pnpm dev
```

---

## Option 2: Cloudflare Workers

### Why Cloudflare Workers?

- **Global edge network**: Serve requests from locations close to users
- **Auto-scaling**: Handle traffic spikes without configuration
- **No servers**: Pay only for requests, not idle time
- **WASM support**: Run cryptographic operations at near-native speed

### Project Setup

**Location**: `examples/relay-cloudflare-worker/`

**Structure**:
```
relay-cloudflare-worker/
├── src/
│   └── worker.ts         # Worker entry point
├── wrangler.toml         # Cloudflare configuration
└── package.json
```

### Implementation

The key difference from Express is WASM module handling:

```typescript
import { AuthService } from '@tatchi-xyz/sdk/server'
import {
  createCloudflareRouter,
  createCloudflareCron
} from '@tatchi-xyz/sdk/server/router/cloudflare'

// Import WASM modules directly (Workers can't use import.meta.url)
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer'
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf'

export default {
  async fetch(request, env, ctx) {
    const service = new AuthService({
      relayerAccountId: env.RELAYER_ACCOUNT_ID,
      relayerPrivateKey: env.RELAYER_PRIVATE_KEY,
      webAuthnContractId: env.WEBAUTHN_CONTRACT_ID,
      nearRpcUrl: env.NEAR_RPC_URL,
      networkId: env.NETWORK_ID || 'testnet',
      accountInitialBalance: env.ACCOUNT_INITIAL_BALANCE,
      createAccountAndRegisterGas: env.CREATE_ACCOUNT_AND_REGISTER_GAS,

      // Pass WASM modules directly
      signerWasm: { moduleOrPath: signerWasmModule },
      shamir: {
        moduleOrPath: shamirWasmModule,
        shamir_p_b64u: env.SHAMIR_P_B64U,
        shamir_e_s_b64u: env.SHAMIR_E_S_B64U,
        shamir_d_s_b64u: env.SHAMIR_D_S_B64U,
      },
    })

    return createCloudflareRouter(service, {
      expectedOrigins: env.EXPECTED_ORIGIN?.split(','),
      expectedWalletOrigins: env.EXPECTED_WALLET_ORIGIN?.split(','),
    })(request, env, ctx)
  },

  // Optional: Enable automatic key rotation via cron
  async scheduled(event, env, ctx) {
    if (env.ENABLE_ROTATION !== '1') return

    return createCloudflareCron(env)(event, env, ctx)
  }
}
```

### WASM Bundling Configuration

Cloudflare Workers require explicit WASM bundling. Update `wrangler.toml`:

```toml
name = "web3authn-relay"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

# Bundle WASM modules
[[rules]]
type = "CompiledWasm"
globs = ["**/*.wasm"]
fallthrough = true

# Non-secret configuration
[vars]
RELAYER_ACCOUNT_ID = "relayer.testnet"
NEAR_RPC_URL = "https://test.rpc.fastnear.com"
NETWORK_ID = "testnet"
WEBAUTHN_CONTRACT_ID = "w3a-v1.testnet"
ACCOUNT_INITIAL_BALANCE = "30000000000000000000000"
CREATE_ACCOUNT_AND_REGISTER_GAS = "85000000000000"

# Optional CORS
EXPECTED_ORIGIN = "https://app.example.com"
EXPECTED_WALLET_ORIGIN = "https://wallet.example.com"

# Optional: Enable rotation via cron
ENABLE_ROTATION = "1"

# Optional: Cron trigger (hourly rotation)
[triggers]
crons = ["0 * * * *"]
```

### Managing Secrets

Secrets are never committed to `wrangler.toml`. Use the CLI:

```bash
# Authenticate once
wrangler login

# Set secrets
wrangler secret put RELAYER_PRIVATE_KEY
wrangler secret put SHAMIR_P_B64U
wrangler secret put SHAMIR_E_S_B64U
wrangler secret put SHAMIR_D_S_B64U
```

### Deployment

```bash
cd examples/relay-cloudflare-worker
pnpm install
wrangler deploy
```

Your relay is now live at `https://your-worker.your-subdomain.workers.dev`.

### Local Development

Test against the real Cloudflare runtime:

```bash
# Run against Cloudflare's edge (uses real WASM runtime)
wrangler dev --remote

# Watch logs
wrangler tail
```

**Why `--remote`?** The local emulator doesn't perfectly match Cloudflare's WASM environment. Testing remotely catches issues early.

---

## API Reference

Both platforms expose identical endpoints used by the SDK:

### Create Account + Register

**`POST /create_account_and_register_user`**

Atomically creates a NEAR account and registers the passkey in a single blockchain transaction.

**Request**:
```json
{
  "new_account_id": "alice.testnet",
  "new_public_key": "ed25519:...",
  "webauthn_registration": {
    "attestation_object": "...",
    "client_data_json": "...",
    "prf_outputs": "..."
  },
  "deterministic_vrf_public_key": "ed25519:...",
  "vrf_data": {
    "salt": "...",
    "iterations": 100000
  }
}
```

**Response**:
```json
{
  "success": true,
  "transactionHash": "ABC123..."
}
```

**Errors**:
- `409`: Account already exists
- `400`: Invalid passkey data
- `500`: Blockchain transaction failed

### Shamir 3-Pass Operations

#### Apply Server Lock

**`POST /vrf/apply-server-lock`**

Client sends a client-locked KEK; server adds its lock and returns the double-locked value.

**Request**:
```json
{
  "kek_c_b64u": "client-locked-kek-base64url"
}
```

**Response**:
```json
{
  "kek_cs_b64u": "client-then-server-locked-base64url",
  "keyId": "sha256-hash-of-server-public-key"
}
```

#### Remove Server Lock

**`POST /vrf/remove-server-lock`**

Client sends a newly-locked value; server removes its original lock.

**Request**:
```json
{
  "kek_st_b64u": "server-then-new-client-locked-base64url",
  "keyId": "sha256-hash-of-server-public-key"
}
```

**Response**:
```json
{
  "kek_t_b64u": "only-client-locked-base64url"
}
```

**Error `403`**: Invalid or expired `keyId` (not in current or grace list).

#### Get Key Info

**`GET /shamir/key-info`**

Returns the current server key ID and grace list for client migration.

**Response**:
```json
{
  "currentKeyId": "sha256-of-current-e_s",
  "p_b64u": "public-modulus-base64url",
  "graceKeyIds": ["sha256-of-old-key-1", "sha256-of-old-key-2"]
}
```

### Health Check

**`GET /healthz`** (optional, enabled via router config)

Returns `200 OK` if the service is healthy.

---

## cURL Examples

Test your relay manually:

```bash
# Check health
curl https://relay.example.com/healthz

# Get current key info
curl https://relay.example.com/shamir/key-info

# Apply server lock
curl -X POST https://relay.example.com/vrf/apply-server-lock \
  -H 'Content-Type: application/json' \
  -d '{"kek_c_b64u":"<client-locked-kek>"}'

# Remove server lock
curl -X POST https://relay.example.com/vrf/remove-server-lock \
  -H 'Content-Type: application/json' \
  -d '{
    "kek_st_b64u":"<server-then-client-locked>",
    "keyId":"<key-id-from-apply-response>"
  }'
```

---

## Security Considerations

### Key ID Enforcement

The `keyId` parameter in `/vrf/remove-server-lock` is **required and validated**. This ensures:
- Clients explicitly choose which server key to use
- The server can't be tricked into using an old, compromised key
- Key rotation is transparent and auditable

### Grace Period Best Practices

**Grace keys** let old keys work temporarily while clients migrate:

1. **Keep the window short**: 24-48 hours is usually sufficient
2. **Limit the list**: Store at most 5 grace keys
3. **Monitor usage**: Log which keys are being used
4. **Prune aggressively**: Remove unused keys after the grace period

```typescript
// Good: Short grace period
await service.rotateShamirServerKeypair({
  keepCurrentInGrace: true,
  maxGraceKeys: 3  // Keep only last 3 keys
})

// Bad: Indefinite grace period
// Never do this - old keys accumulate forever
```

### CORS Configuration

Be explicit about allowed origins:

```typescript
// Good: Specific origins
cors({ origin: ['https://app.example.com', 'https://wallet.example.com'] })

// Bad: Accept all origins
cors({ origin: '*' })  // ← Don't do this in production
```

### Secret Management

**Express**:
- Use `.env` files (never commit them!)
- For production: Use secret managers (AWS Secrets Manager, HashiCorp Vault)
- Rotate `RELAYER_PRIVATE_KEY` periodically

**Cloudflare**:
- Always use `wrangler secret put` for sensitive values
- Secrets are encrypted at rest and in transit
- Use separate Workers for staging/production

---

## Troubleshooting

### Common Issues

#### "Invalid URL string" (Cloudflare only)

**Cause**: Worker tried to use `import.meta.url` to load WASM, which doesn't work in the Workers runtime.

**Fix**:
1. Import WASM modules directly: `import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer'`
2. Pass via config: `signerWasm: { moduleOrPath: signerWasmModule }`
3. Ensure `wrangler.toml` has the WASM bundling rule

#### CORS Errors

**Symptoms**: Browser shows "blocked by CORS policy" in console.

**Fix**:
- Express: Verify `cors()` middleware includes the client origin
- Cloudflare: Set `EXPECTED_ORIGIN` and `EXPECTED_WALLET_ORIGIN` in `wrangler.toml`
- Check browser DevTools → Network → Response Headers for `Access-Control-Allow-Origin`

#### Account Creation Fails with "insufficient balance"

**Cause**: Relay account doesn't have enough NEAR to fund new accounts.

**Fix**:
1. Check relayer balance: `near state relayer.testnet`
2. Fund it: `near send your-account.testnet relayer.testnet 10`
3. Verify `accountInitialBalance` in config is reasonable (0.03 NEAR is typical)

#### Shamir Unlock Returns 403

**Cause**: Client is using an expired `keyId` not in the grace list.

**Fix**:
1. Client should call `/shamir/key-info` to get the current `keyId`
2. If `keyId` changed, client must re-wrap with the new key
3. Check server logs for which `keyId` was requested vs. what's available

### Debugging Tips

**Express**:
```typescript
// Add request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body)
  next()
})
```

**Cloudflare**:
```bash
# Live tail logs
wrangler tail

# Filtered logs
wrangler tail --status error
```

---

## Next Steps

- **Configure the SDK**: Point your client at the relay URL
- **Set up monitoring**: Track account creation rate, error rates, key rotation events
- **Configure CI/CD**: See [Cloudflare + GitHub Actions](/docs/guides/cloudflare-github-actions-setup) for automated deployments
- **Review security**: Read the [Security Model](/docs/concepts/security-model) to understand the full architecture
