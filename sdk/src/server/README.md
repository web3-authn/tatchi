# Server Package

AuthService provides the server‑side pieces for account creation and WebAuthn + VRF verification. Session handling is optional and pluggable — pass a SessionService (or compatible adapter) into the routers. The SDK itself does not bundle a JWT library.

## Quick Start (Express)

```ts
import express from 'express';
import cors from 'cors';
import { AuthService, SessionService } from '@tatchi-xyz/sdk/server';
import { createRelayRouter } from '@tatchi-xyz/sdk/server/router/express';
import jwt from 'jsonwebtoken';

const service = new AuthService({
  relayerAccountId: process.env.RELAYER_ACCOUNT_ID!,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
  webAuthnContractId: process.env.WEBAUTHN_CONTRACT_ID || 'w3a-v1.testnet',
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
  networkId: process.env.NETWORK_ID || 'testnet'
});

const session = new SessionService({
  jwt: {
    signToken: ({ payload }) => jwt.sign(payload as any, process.env.JWT_SECRET || 'dev-insecure', {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER || 'relay',
      audience: process.env.JWT_AUDIENCE || 'app',
      expiresIn: Number(process.env.JWT_EXPIRES_SEC || 24 * 60 * 60)
    }),
    verifyToken: async (token: string) => {
      try { const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-insecure') as any; return { valid: true, payload }; }
      catch { return { valid: false }; }
    }
  },
  // Minimal cookie config (defaults to HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=24h)
  cookie: { name: 'w3a_session' }
});

const app = express();
app.use(express.json());
app.use(cors({ origin: [process.env.EXPECTED_ORIGIN!, process.env.EXPECTED_WALLET_ORIGIN!].filter(Boolean), credentials: true }));
app.use('/', createRelayRouter(service, { healthz: true, session }));
app.listen(3000);
```

## Quick Start (Cloudflare Workers)

```ts
import { AuthService, SessionService } from '@tatchi-xyz/sdk/server';
import { createCloudflareRouter } from '@tatchi-xyz/sdk/server/router/cloudflare';
import signerWasm from '@tatchi-xyz/sdk/server/wasm/signer';
import shamirWasm from '@tatchi-xyz/sdk/server/wasm/vrf';
import jwt from 'jsonwebtoken';

const service = new AuthService({
  relayerAccountId: env.RELAYER_ACCOUNT_ID,
  relayerPrivateKey: env.RELAYER_PRIVATE_KEY,
  webAuthnContractId: env.WEBAUTHN_CONTRACT_ID,
  nearRpcUrl: env.NEAR_RPC_URL,
  networkId: env.NETWORK_ID || 'testnet',
  shamir: { moduleOrPath: shamirWasm, shamir_p_b64u: env.SHAMIR_P_B64U, shamir_e_s_b64u: env.SHAMIR_E_S_B64U, shamir_d_s_b64u: env.SHAMIR_D_S_B64U },
  signerWasm: { moduleOrPath: signerWasm }
});

const session = new SessionService({
  jwt: {
    signToken: ({ payload }) => jwt.sign(payload as any, env.JWT_SECRET || 'dev-insecure', { algorithm: 'HS256' }),
    verifyToken: async (token: string) => { try { return { valid: true, payload: jwt.verify(token, env.JWT_SECRET || 'dev-insecure') }; } catch { return { valid: false }; } }
  },
  cookie: { name: 'w3a_session' }
});

export default {
  async fetch(request: Request, env: any) {
    const router = createCloudflareRouter(service, { corsOrigins: [env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN].filter(Boolean), session });
    return router(request, env);
  }
}
```

## Routes exposed by the routers

- POST `/create_account_and_register_user` — atomic account creation + registration (used by the SDK registration flow)
- POST `/verify-authentication-response` — VRF + WebAuthn verification (VIEW call). Body:
  - `{ sessionKind: 'jwt' | 'cookie', vrf_data, webauthn_authentication }`
  - `sessionKind='jwt'` → JSON returns `{ jwt }`; `sessionKind='cookie'` → sets `Set-Cookie` (HttpOnly) and omits `jwt` in body.
- GET `/session/auth` — returns `{ authenticated, claims? }` based on Authorization: Bearer or cookie
- POST `/session/logout` — clears the session cookie
- POST `/vrf/apply-server-lock`, POST `/vrf/remove-server-lock`, GET `/shamir/key-info` — Shamir 3‑pass endpoints (optional)
- GET `/.well-known/webauthn` — Related Origin Requests manifest (wallet-scoped credentials)

## Sessions

You have two integration styles:

1) Provide a SessionService (hook‑first) or compatible adapter
- Supply `signToken` and `verifyToken` using your preferred JWT library (e.g., jsonwebtoken).
- Optionally provide cookie hooks to customize headers if using cookie mode.

Cookie hooks (optional)
```ts
const session = new SessionService({
  jwt: { /* signToken/verifyToken as above */ },
  cookie: {
    name: 'w3a_session',
    // Customize Set-Cookie attributes (e.g., cross-site):
    buildSetHeader: (token) => [
      `w3a_session=${token}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=None',
      'Domain=.example.localhost',
      'Max-Age=86400'
    ].join('; '),
    buildClearHeader: () => [
      'w3a_session=',
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=None',
      'Domain=.example.localhost',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ].join('; '),
    // Optional: custom extraction from headers (Bearer or Cookie)
    extractToken: (headers, cookieName) => {
      const auth = (headers['authorization'] || headers['Authorization']) as string | undefined;
      if (auth && /^Bearer\s+/.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
      const cookie = (headers['cookie'] || headers['Cookie']) as string | undefined;
      if (!cookie) return null;
      for (const part of cookie.split(';')) {
        const [k, v] = part.split('=');
        if (k && k.trim() === cookieName) return (v || '').trim();
      }
      return null;
    }
  }
});
```

For cookies, configure CORS with explicit origins and `credentials: true`.

Default behavior
- No session is minted by default. The client must opt‑in by calling `loginPasskey(..., { session: { kind: 'jwt' | 'cookie', relayUrl?, route? }})`.
- On the server, sessions are only active if you provide a SessionService (or compatible adapter) to the router options.

Configurable session endpoints
- Express adaptor: `createRelayRouter(service, { session, sessionRoutes })` (defaults to `/session/auth` and `/session/logout`).
- Cloudflare adaptor: `createCloudflareRouter(service, { session, sessionRoutes, corsOrigins })` (same defaults).

Cloudflare CORS note
- The Cloudflare router will only set `Access-Control-Allow-Credentials: true` when echoing a specific Origin. If `corsOrigins` is `'*'`, credentials are not advertised (as required by Fetch/CORS rules). Use explicit origins when using cookie sessions.

## Config (required)

```bash
RELAYER_ACCOUNT_ID=relayer.testnet
RELAYER_PRIVATE_KEY=ed25519:...
WEBAUTHN_CONTRACT_ID=w3a-v1.testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
NETWORK_ID=testnet
```

Optional session vars (examples use these):

```bash
JWT_SECRET=change-me
JWT_ISSUER=relay
JWT_AUDIENCE=your-app
JWT_EXPIRES_SEC=86400
SESSION_COOKIE_NAME=w3a_session

# Optional: override session route paths
# Session routes are configured in code via router options.
```
