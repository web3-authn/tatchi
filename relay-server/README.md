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

## Configuration

Create `.env` file:
```bash
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
NEAR_NETWORK_ID=testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
PORT=3001
EXPECTED_ORIGIN=http://localhost:3000
```

## Development

```bash
pnpm install
pnpm run dev    # Development server
pnpm run test   # Run tests
pnpm run build  # Build for production
pnpm start      # Production server
```

## Architecture

- **AccountService**: Manages NEAR account operations
- **Transaction Queue**: Prevents nonce conflicts for relayer account
- **Validation**: Account ID format and public key validation
