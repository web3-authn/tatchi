# Server Package

A simple account service for creating accounts and registering
users with the Web3Authn contract.

## Usage

```typescript
import { NearAccountService, getServerConfig } from '@web3authn/passkey/server';

// Get configuration from environment variables
const config = getServerConfig();

// Create service instance
const accountService = new NearAccountService(config);

// Create account
const result = await accountService.createAccount({
  accountId: 'user.testnet',
  publicKey: 'ed25519:...'
});

// Atomic account creation + WebAuthn registration
const atomicResult = await accountService.createAccountAndRegisterUser({
  new_account_id: 'user.testnet',
  new_public_key: 'ed25519:...',
  vrf_data: { /* VRF verification data */ },
  webauthn_registration: { /* WebAuthn credential */ }
});
```

## Framework Examples

### Express.js

```typescript
import express from 'express';
import { NearAccountService, getServerConfig } from '@web3authn/passkey/server';

const app = express();
const accountService = new NearAccountService(getServerConfig());

app.post('/create_account_and_register_user', async (req, res) => {
  const result = await accountService.createAccountAndRegisterUser(req.body);
  res.json(result);
});
```

### Vercel Edge Functions

```typescript
import { NearAccountService, getServerConfig } from '@web3authn/passkey/server';

const accountService = new NearAccountService(getServerConfig());

export default async function handler(request: Request) {
  const body = await request.json();
  const result = await accountService.createAccountAndRegisterUser(body);
  return Response.json(result);
}

export const runtime = 'edge';
```

### Cloudflare Workers

```typescript
import { NearAccountService, getServerConfig } from '@web3authn/passkey/server';

export default {
  async fetch(request: Request, env: any) {
    const config = getServerConfig(env);
    const accountService = new NearAccountService(config);

    const body = await request.json();
    const result = await accountService.createAccountAndRegisterUser(body);
    return Response.json(result);
  }
};
```

## Environment Variables

```bash
RELAYER_ACCOUNT_ID=your-relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:relayer-private-key
NEAR_RPC_URL=https://rpc.testnet.near.org
NETWORK_ID=testnet
WEBAUTHN_CONTRACT_ID=web3-authn-v4.testnet
DEFAULT_INITIAL_BALANCE=50000000000000000000000
```

## Types

```typescript
interface ServerConfig {
  relayerAccountId: string;
  relayerPrivateKey: string;
  nearRpcUrl: string;
  webAuthnContractId: string;
  networkId: string;
  defaultInitialBalance: string;
}

interface CreateAccountAndRegisterRequest {
  new_account_id: string;
  new_public_key: string;
  vrf_data: ContractVrfData;
  webauthn_registration: WebAuthnRegistrationCredential;
  deterministic_vrf_public_key: Uint8Array;
}
```