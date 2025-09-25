# Relay Server

NEAR relay server that creates accounts on behalf of users, where the relayer pays gas fees.

## Features

- **Direct Account Creation**: Create NEAR accounts using relay server authority
- **Custom Funding**: Configurable initial balance for new accounts
- **Transaction Queuing**: Prevents nonce conflicts
- **Simple JSON API**: Easy integration

## API

### `POST /create_account_and_register_user`
Atomically create a NEAR account and register a WebAuthn authenticator with the Web3Authn contract.

- Request body (abridged): `{ new_account_id, new_public_key, vrf_data, webauthn_registration, deterministic_vrf_public_key, authenticator_options? }`
- Response: `{ success, transactionHash?, error?, message? }`

This route is consumed internally by the SDK’s registration flows.

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

## Configuration

Create `.env` file:
```bash
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
NEAR_NETWORK_ID=testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
PORT=3001
EXPECTED_ORIGIN=http://localhost:3000

# Shamir 3-pass parameters
SHAMIR_P_B64U=<base64url_of_prime_p>
SHAMIR_E_S_B64U=<base64url_server_exponent_e_s>
SHAMIR_D_S_B64U=<base64url_server_inverse_d_s>
# Optional: grace keys accepted for remove-server-lock during rotation
# SHAMIR_GRACE_KEYS='[{"e_s_b64u":"...","d_s_b64u":"..."}]'

### Key Rotation & Grace Keys

Grace keys let you accept previously-active server keys for a limited time during rotation. They are used only for removing the server lock (unwrap) so older client blobs can still be unlocked. New wraps (apply-server-lock) always use the current key.

- currentKeyId: Deterministic ID derived from the active server exponent (sha256 of `e_s_b64u`, base64url).
- keyId in API: Clients must send `keyId` with `POST /vrf/remove-server-lock`. The server uses this to select the exact key.
- graceShamirKeys: An array of older `(e_s_b64u, d_s_b64u)` pairs that the server will accept for `remove-server-lock` when `keyId` matches one of them.

Rotation flow:
1) Add a new keypair `(e_s, d_s)` and set it as current in env (`SHAMIR_E_S_B64U`, `SHAMIR_D_S_B64U`).
2) Move the previous keypair into `SHAMIR_GRACE_KEYS` (JSON array).
3) Clients will receive the new `keyId` on the next `apply-server-lock` and persist it locally; on unlock, they send `keyId` back.
4) Clients proactively refresh their blobs to the new key (SDK handles this after a successful unlock); after a grace period, remove the old key from `SHAMIR_GRACE_KEYS`.

Example `SHAMIR_GRACE_KEYS` value (single grace key):
```bash
export SHAMIR_GRACE_KEYS='[
  {"e_s_b64u":"<old_es_b64u>","d_s_b64u":"<old_ds_b64u>"}
]'
```

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
