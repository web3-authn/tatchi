# Relay Server

NEAR relay server that creates accounts on behalf of users, where the relayer pays gas fees.

## Features

- **Direct Account Creation**: Create NEAR accounts using relay server authority
- **Custom Funding**: Configurable initial balance for new accounts
- **Transaction Queuing**: Prevents nonce conflicts
- **Simple JSON API**: Easy integration

## API

### Health endpoints

- `GET /healthz` — basic server health + feature configuration hints (fast; no external dependency checks)
- `GET /readyz` — readiness check for configured dependencies (zk-email prover / Shamir WASM when configured)

### `POST /create_account_and_register_user`
Atomically create a NEAR account and register a WebAuthn authenticator with the Web3Authn contract.

- Request body (abridged): `{ new_account_id, new_public_key, vrf_data, webauthn_registration, deterministic_vrf_public_key, authenticator_options? }`
- Response: `{ success, transactionHash?, error?, message? }`

This route is consumed internally by the SDK’s registration flows.

### `POST /verify-authentication-response` (sessions)

Verifies a VRF‑anchored WebAuthn assertion against the contract (VIEW call) and issues a session.

- Request body:
  ```json
  {
    "sessionKind": "jwt" | "cookie",
    "vrf_data": { /* ContractVrfData */ },
    "webauthn_authentication": { /* WebAuthn assertion */ }
  }
  ```
- Response:
  - When `sessionKind` is `jwt`: `{ success, verified, jwt }`.
  - When `sessionKind` is `cookie`: sets `Set-Cookie: w3a_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/` and omits `jwt` in body.

Notes
- The sample server mounts this route via the SDK router (`createRelayRouter(authService)`).
- For cookie sessions, CORS must allow credentials and specify explicit origins.
  The example config enables CORS with `origin: [EXPECTED_ORIGIN, EXPECTED_WALLET_ORIGIN]` and `credentials: true`.
  Your frontend must use `credentials: 'include'` with fetch.

### `POST /recover-email` (email recovery)

Receives a JSON `ForwardableEmailPayload` (including `raw` containing the full RFC822 message) and forwards it into `EmailRecoveryService.requestEmailRecovery`.

Production notes:
- This server is the HTTP sink; you still need an email ingress (inbound email provider/webhook or your own MTA pipeline) to receive SMTP and then `POST` here.
- Emails can be large; this example uses `express.json({ limit: '5mb' })`.

### Shamir 3‑pass (strict keyId mode)

These endpoints implement the commutative VRF key wrap/unwrap. keyId is required to select the correct server key.

#### `POST /vrf/apply-server-lock`
Request:
```json
{ "kek_c_b64u": "base64url" }
```
Response:
```json
{ "kek_cs_b64u": "base64url", "keyId": "sha256_of_e_s_b64u_base64url" }
```

#### `POST /vrf/remove-server-lock`
Request:
```json
{ "kek_cs_b64u": "base64url", "keyId": "sha256_of_e_s_b64u_base64url" }
```
Response:
```json
{ "kek_c_b64u": "base64url" }
```

#### `GET /shamir/key-info`
Response:
```json
{ "currentKeyId": "...", "p_b64u": "...", "graceKeyIds": ["..."] }
```
Use this to proactively rotate client blobs when the server changes keys.

### Runtime Rotation Helpers

You can rotate the active server keypair while the process stays online. The SDK exposes helpers directly on `AuthService` so you can wire rotations into a cron/timer without new HTTP endpoints.

```ts
// server/key-rotation.ts
import { AuthService } from '@tatchi-xyz/sdk/server';

export async function rotateDaily(authService: AuthService) {
  const result = await authService.rotateShamirServerKeypair({
    keepCurrentInGrace: true,        // default: true
    persistGraceToDisk: true,        // default: true
  });

  console.log('[rotation] active key', result.newKeyId);
  console.log('[rotation] grace keys', result.graceKeyIds);

  // Persist the new key material wherever you keep secrets
  // (env vars, vault, etc.). The helper only mutates the in-process instance.
  // result.newKeypair contains { e_s_b64u, d_s_b64u }.
}
```

Under the hood `rotateShamirServerKeypair`:

- Generates a fresh `(e_s, d_s)` pair and swaps it into the live service.
- Moves the previous key into the grace set (unless `keepCurrentInGrace: false`).
- Writes the updated grace list to `grace-keys.json` (or the path you configure), so restarts restore grace keys automatically.

You can also pre-generate a pair without swapping it in:

```ts
const preview = await authService.generateShamirServerKeypair();
// => { e_s_b64u, d_s_b64u, keyId }
```

#### Optional HTTP admin routes

The sample Express server in this repo still exposes `/shamir/rotate-keys` and `/shamir/grace-keys` routes that call the helpers above. They are convenient for demos but not required; feel free to remove them in production and invoke the SDK API from a background job instead.

### Scheduled rotation

The example server can boot an internal cron that calls `rotateShamirServerKeypair` on an interval configured via `ROTATE_EVERY` (minutes) when `ENABLE_ROTATION=1`. The task:

- rotates to a fresh keypair and logs the new `keyId`
- trims the grace list so that at most 5 entries remain (oldest first)
- prints the resulting grace key IDs to the console

No HTTP endpoint is exposed for this job. If you adopt the pattern in production, remember to persist the returned `e_s_b64u`/`d_s_b64u` outside of process memory (e.g. secret manager) before the process restarts.

Configure interval:
```bash
# minutes
ROTATE_EVERY=60
ENABLE_ROTATION=1
```

## Configuration

Create `.env` file:
```bash
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
NEAR_NETWORK_ID=testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
PORT=3001
EXPECTED_ORIGIN=http://localhost:3000
# If you serve from multiple origins, set EXPECTED_WALLET_ORIGIN as well
# EXPECTED_WALLET_ORIGIN=http://localhost:4173

# Shamir 3-pass parameters
SHAMIR_P_B64U=<base64url_of_prime_p>
SHAMIR_E_S_B64U=<base64url_server_exponent_e_s>
SHAMIR_D_S_B64U=<base64url_server_inverse_d_s>
# Optional: override where grace keys are persisted (default: ./grace-keys.json)
# SHAMIR_GRACE_KEYS_FILE=./secure/grace-keys.json

# Optional: zk-email prover base URL (used when explicitMode='zk-email' or email body marker is 'zk-email')
# ZK_EMAIL_PROVER_BASE_URL=http://127.0.0.1:5588
# ZK_EMAIL_PROVER_TIMEOUT_MS=60000

### Key Rotation & Grace Keys

Grace keys let you accept previously-active server keys for a limited time during rotation. They are used only for removing the server lock (unwrap) so older client blobs can still be unlocked. New wraps (apply-server-lock) always use the current key.

- currentKeyId: Deterministic ID derived from the active server exponent (sha256 of `e_s_b64u`, base64url).
- keyId in API: Clients must send `keyId` with `POST /vrf/remove-server-lock`. The server uses this to select the exact key.
- graceShamirKeys: An array of older `(e_s_b64u, d_s_b64u)` pairs that the server will accept for `remove-server-lock` when `keyId` matches one of them.

Rotation flow:
1) Call `rotateShamirServerKeypair` (or the HTTP proxy) to mint the new key, optionally keeping the current key in grace. The helper writes grace entries to `grace-keys.json` so they survive restarts.
2) Persist the returned `newKeypair` (`e_s_b64u`, `d_s_b64u`) to your secret store / env variables so new processes boot with the same active key.
3) Clients receive the new `keyId` on their next `apply-server-lock` call and cache it. When they submit `remove-server-lock`, they include that `keyId`.
4) The SDK refreshes client VRF blobs after a successful unlock, so after your grace window expires you can delete the entry from `grace-keys.json` (or hit the optional HTTP admin route) to retire the old key.

Security notes:
- `keyId` is required on `remove-server-lock` and selects a single key deterministically; requests without `keyId` are rejected.
- Grace keys are only used to peel an existing lock; new locks always use the current key.
- Keep the grace window short, and remove older keys once clients have refreshed.
```

### Shamir 3-pass Key Generation

You need a safe prime `p` and a server exponent pair `(e_s, d_s)` with `e_s * d_s ≡ 1 (mod p−1)`.

```bash
# Generate server exponents (requires SHAMIR_P_B64U in env or --p-file)
SHAMIR_P_B64U=... pnpm --filter near-account-service-server run gen:shamir
# Or:
pnpm --filter near-account-service-server run gen:shamir --p-file ./prime_b64u.txt
```

Outputs `SHAMIR_E_S_B64U` and `SHAMIR_D_S_B64U` for your `.env`.

## Development

### Step 1: Generate SRA Keys

First, generate the SRA keypair needed for commutative encryption:

```bash
pnpm run generate-keys
```

This will output an `SRA_PRIVATE_KEY` to add to your `.env` file.

### Step 2: Run the Server

```bash
pnpm install
pnpm run dev    # Development server with auto-reload
pnpm run build  # Build for production
pnpm start      # Production server
```
