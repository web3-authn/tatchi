---
title: Authentication Sessions
---

# Authentication Sessions

Reduce biometric prompts by enabling VRF-backed authentication sessions. After initial login, users can interact with your backend APIs without repeated TouchID/FaceID prompts.

## Overview

By default, every backend API call requiring authentication triggers a WebAuthn prompt. Sessions enable:
- **Single sign-on**: One TouchID prompt at login, then session-based auth for subsequent requests
- **Zero-gas verification**: Backend verifies VRF proofs via contract VIEW calls (no transactions)
- **Freshness anchored on-chain**: VRF challenges tied to recent NEAR block data

## Enabling Sessions

### Client Configuration

```typescript
const result = await passkeyManager.loginPasskey('alice.testnet', {
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
```typescript
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
```typescript
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

## How It Works

### With Shamir 3-Pass (No Prompt)

When Shamir auto-unlock succeeds:
1. SDK unlocks VRF keypair using cached server-encrypted data
2. Fetches latest NEAR block height/hash
3. Generates VRF challenge anchored to that block
4. Collects WebAuthn assertion (single TouchID prompt)
5. POSTs to relay `/verify-authentication-response`
6. Relay verifies via contract VIEW call, issues session token
7. SDK stores token, uses for subsequent API calls

### Fallback (Two Prompts or Deferred)

When Shamir unlock fails:
1. **First prompt**: Unlock VRF keypair using PRF from WebAuthn
2. **Second prompt** (if session enabled): Generate VRF challenge, collect assertion, mint session

**Alternative**: Omit `session` at login, defer until first API call needs it (one prompt total, but delayed UX).

## Login Flow Comparison

**Without sessions:**
```typescript
// Every API call triggers TouchID
await passkeyManager.loginPasskey('alice.testnet')
await apiCall1()  // TouchID prompt
await apiCall2()  // TouchID prompt
await apiCall3()  // TouchID prompt
```

**With sessions:**
```typescript
// One TouchID at login, then session-based auth
await passkeyManager.loginPasskey('alice.testnet', {
  session: { kind: 'jwt', relayUrl: 'https://relay.example.com' }
})
await apiCall1()  // No prompt, uses session
await apiCall2()  // No prompt, uses session
await apiCall3()  // No prompt, uses session
```

## Security

**VRF freshness**: Challenges include recent block height/hash. Contract VIEW rejects stale inputs (e.g., >10 blocks old).

**rpId binding**: VRF inputs include the rpId used at registration. Contract verifies it matches allowed origins.

**Session expiry**: Set short TTLs (1-24 hours). Rotate JWT signing keys regularly.

**Cookie security** (if using cookies):
```typescript
cookie: {
  buildSetHeader: (token) => [
    `session=${token}`,
    'Path=/',
    'HttpOnly',      // JS can't read
    'Secure',        // HTTPS only
    'SameSite=Lax',  // CSRF protection
    'Max-Age=86400'  // 24 hours
  ].join('; ')
}
```

## Session Lifecycle

```typescript
// Login with session
await passkeyManager.loginPasskey('alice.testnet', { session: { kind: 'jwt', relayUrl } })

// SDK stores token internally
// Subsequent signing operations include it automatically

// Logout clears session
await passkeyManager.logout()
```

## Troubleshooting

**Two prompts at login**: Shamir auto-unlock failed. Check relay server is configured correctly and server key hasn't rotated without client refresh.

**Session verification fails**: VRF challenge expired. Relay accepts challenges based on recent blocks (check contract freshness window).

**Cookie not sent**: Verify `SameSite` and `Secure` flags match your deployment (cross-origin requires `SameSite=None; Secure`).

**JWT invalid**: Check JWT_SECRET matches between token issuance and verification. Verify token hasn't expired.

## See Also

- [Relay Server Deployment](./relay-server-deployment.md) - Deploy relay with session support
- [VRF Challenges](../concepts/vrf-challenges.md) - How VRF-backed auth works
- [Passkeys](./passkeys.md) - Login flows and Shamir 3-pass
