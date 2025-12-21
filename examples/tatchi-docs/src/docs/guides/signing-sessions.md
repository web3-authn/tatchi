---
title: Signing Sessions
---

# Signing Sessions

The SDK supports two session types that reduce repeated TouchID/FaceID prompts:

- **Authentication sessions (backend)**: Mint a JWT or HttpOnly cookie via the relayer so your API calls do not need per-request WebAuthn prompts.
- **Warm signing sessions (local)**: Cache a short-lived VRF capability in the worker so local signing can happen multiple times without repeated prompts.

You can use both together: authentication sessions cover backend API auth, warm signing sessions cover local signing prompts.

## Authentication Sessions (Backend)

### Overview

By default, every backend API call requiring authentication triggers a WebAuthn prompt. Sessions enable:
- **Single sign-on**: One TouchID prompt at login, then session-based auth for subsequent requests
- **Zero-gas verification**: Backend verifies VRF proofs via contract VIEW calls (no transactions)
- **Freshness anchored on-chain**: VRF challenges tied to recent NEAR block data

### Client Configuration

```ts
const result = await passkeyManager.loginAndCreateSession('alice.testnet', {
  session: {
    kind: 'jwt',  // or 'cookie'
    relayUrl: 'https://relay.example.com',
    route: '/verify-authentication-response'  // optional, defaults to this
  }
})
```

**Session modes:**
- `jwt`: Relay returns JWT token, client includes in `Authorization: Bearer <token>` headers
- `cookie`: Relay sets HttpOnly cookie, browser sends automatically

### Relay Server Setup

**Express:**
```ts
import { SessionService } from '@tatchi-xyz/sdk/server'

const sessionService = new SessionService({
  jwt: {
    signToken: async (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' }),
    verifyToken: async (token) => jwt.verify(token, JWT_SECRET)
  }
})

app.use('/', createRelayRouter(authService, {
  sessionService,
  healthz: true
}))
```

**Cloudflare Workers:**
```ts
const sessionService = new SessionService({
  jwt: {
    signToken: async (payload) => /* use Workers crypto or KV */,
    verifyToken: async (token) => /* verify with Workers crypto */
  }
})

export default {
  async fetch(request, env, ctx) {
    return createCloudflareRouter(authService, {
      sessionService,
      expectedOrigins: env.EXPECTED_ORIGIN?.split(',')
    })(request, env, ctx)
  }
}
```

### How It Works

**With Shamir 3-Pass (No Prompt)**

When Shamir auto-unlock succeeds:
1. SDK unlocks VRF keypair using cached server-encrypted data
2. Fetches latest NEAR block height/hash
3. Generates VRF challenge anchored to that block
4. Collects WebAuthn assertion (single TouchID prompt)
5. POSTs to relay `/verify-authentication-response`
6. Relay verifies via contract VIEW call, issues session token
7. SDK stores token, uses for subsequent API calls

**Fallback (Two Prompts or Deferred)**

When Shamir unlock fails:
1. **First prompt**: Unlock VRF keypair using PRF from WebAuthn
2. **Second prompt** (if session enabled): Generate VRF challenge, collect assertion, mint session

**Alternative**: Omit `session` at login and defer session creation until the first API call (one prompt total, but delayed UX).

### Login Flow Comparison

**Without sessions:**
```ts
// Every API call triggers TouchID
await passkeyManager.loginAndCreateSession('alice.testnet')
await apiCall1()  // TouchID prompt
await apiCall2()  // TouchID prompt
await apiCall3()  // TouchID prompt
```

**With sessions:**
```ts
// One TouchID at login, then session-based auth
await passkeyManager.loginAndCreateSession('alice.testnet', {
  session: { kind: 'jwt', relayUrl: 'https://relay.example.com' }
})
await apiCall1()  // No prompt, uses session
await apiCall2()  // No prompt, uses session
await apiCall3()  // No prompt, uses session
```

### Security Notes

- **VRF freshness**: Challenges include recent block height/hash. Contract VIEW rejects stale inputs (e.g., >10 blocks old).
- **rpId binding**: VRF inputs include the rpId used at registration. Contract verifies it matches allowed origins.
- **Session expiry**: Set short TTLs (1-24 hours). Rotate JWT signing keys regularly.

**Cookie security** (if using cookies):
```ts
cookie: {
  buildSetHeader: (token) => [
    `session=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=86400'
  ].join('; ')
}
```

### Session Lifecycle

```ts
// Login with session
await passkeyManager.loginAndCreateSession('alice.testnet', { session: { kind: 'jwt', relayUrl } })

// SDK stores token internally
// Subsequent signing operations include it automatically

// Logout clears session
await passkeyManager.logoutAndClearSession()
```

### Troubleshooting

- **Two prompts at login**: Shamir auto-unlock failed. Check relay server configuration and server key rotation.
- **Session verification fails**: VRF challenge expired. Confirm the freshness window on the contract.
- **Cookie not sent**: Verify `SameSite` and `Secure` flags match your deployment (cross-origin requires `SameSite=None; Secure`).
- **JWT invalid**: Check the signing secret and token expiration.

## Warm Signing Sessions (VRF)

Warm signing sessions reduce repeated prompts while signing locally. The wallet mints a short-lived VRF session in the worker and reuses it for multiple signing operations.

For the worker-level handshake details, see [VRF Sessions](/docs/concepts/vrf-sessions).

### Configure Defaults

Warm signing sessions are controlled by `signingSessionDefaults`:

```ts
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

const config = {
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  signingSessionDefaults: {
    ttlMs: 5 * 60 * 1000, // how long the session stays valid
    remainingUses: 3,     // how many sign operations it can cover
  },
}
```

### Override Per Login

You can override the policy for a single login:

```ts
await tatchi.loginAndCreateSession('alice.testnet', {
  signingSession: { ttlMs: 10 * 60 * 1000, remainingUses: 10 },
})
```

### Notes

- Warm signing sessions are in-memory only (cleared on refresh/close) and enforced by the VRF worker.
- This is separate from backend authentication sessions (JWT/cookie). You can use both together.

## See Also

- [Relay Server Deployment](./relay-server-deployment.md) - Deploy relay with session support
- [VRF Challenges](../concepts/vrf-webauthn.md) - How VRF-backed auth works
- [Registration & Login Progress Events](./progress-events.md) - WebAuthn flows and Shamir 3-pass progress events
