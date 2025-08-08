# Relay Server

NEAR relay server that creates accounts on behalf of users, where the relayer pays gas fees.

## Features

- **Direct Account Creation**: Create NEAR accounts using relay server authority
- **Custom Funding**: Configurable initial balance for new accounts
- **Transaction Queuing**: Prevents nonce conflicts
- **Simple JSON API**: Easy integration

## API

### `POST /relay/create-account`
Create a new NEAR account.

**Request:**
```json
{
  "accountId": "user.near",
  "publicKey": "ed25519:ABC123...",
  "initialBalance": "20000000000000000000000"  // Optional, in yoctoNEAR
}
```

**Response:**
```json
{
  "success": true,
  "transactionHash": "...",
  "accountId": "user.near",
  "message": "Account created successfully with 0.02 NEAR initial balance"
}
```

### `POST /verify-authentication-response`
Verify WebAuthn authentication and issue session credentials.

**Request:**
```json
{
  "vrfChallenge": {
    "accountId": "user.near",
    "challenge": "base64url_encoded_challenge",
    "vrfPublicKey": "base64url_encoded_public_key"
  },
  "webauthnAuthentication": {
    "id": "credential_id",
    "rawId": "base64url_encoded_raw_id",
    "response": {
      "authenticatorData": "base64url_encoded_data",
      "clientDataJSON": "base64url_encoded_json",
      "signature": "base64url_encoded_signature"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "jwt": "eyJhbGciOiJIUzI1NiIs...",
  "sessionCredential": { /* session data */ }
}
```

### `POST /vrf/apply-server-lock`
Apply the server lock to the client's blinded KEK.

Request body:
```json
{ "m_blinded_b64u": "..." }
```

Response:
```json
{ "m_blinded_es_b64u": "..." }
```

### `POST /vrf/remove-server-lock`
Remove the server lock from the client's one-time re-blinded KEK.

Request body:
```json
{ "m_blinded_b64u": "..." }
```

Response:
```json
{ "m_blinded_ds_b64u": "..." }
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

# Shamir 3-pass parameters
SHAMIR_P_B64U=<base64url_of_prime_p>
SHAMIR_E_S_B64U=<base64url_server_exponent_e_s>
SHAMIR_D_S_B64U=<base64url_server_inverse_d_s>
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
