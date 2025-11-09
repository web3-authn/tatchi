# Login + Auth Sessions (Option A)

## Overview
Option A is the default login/session model:
- Client generates a VRF‑backed WebAuthn challenge tied to a fresh NEAR block.
- Client collects a WebAuthn authentication response.
- Relay forwards `{ vrf_data, webauthn_authentication }` to the web3authn contract as a VIEW (no gas).
- If verified, the router issues a session (JWT or HttpOnly cookie) when a SessionService adapter is provided.
- VRF remains unlocked in the worker for stateless client auth (signing, flows) until logout.

This yields: strong rpId binding (WebAuthn), freshness anchored on chain (VRF + block), zero server nonce DB, and a simple relay.

## Goals
- Single endpoint to mint sessions: `POST /verify-authentication-response`.
- Zero‑gas verification: use a contract VIEW call, not a transaction.
- One TouchID prompt when Shamir auto‑unlock succeeds; clean fallback when it doesn’t.

## Client Flow
- Inputs: `session?: { kind: 'jwt' | 'cookie'; relayUrl?: string; route?: string }` on `loginPasskey()`.

1) Shamir auto‑unlock path (no prompt)
- Try `shamir3PassDecryptVrfKeypair`.
- If success and `withSession` is true:
  - Fetch latest block context via `NonceManager`.
  - `generateVrfChallenge({ userId, rpId, blockHeight, blockHash })`.
  - `getAuthenticationCredentialsSerialized({ allowCredentials, challenge: vrfChallenge })` (ONE TouchID).
  - POST to relay `POST /verify-authentication-response` with `{ vrf_data, webauthn_authentication }`.
  - Receive JWT/cookie; keep VRF session active.
  - SDK emits `login-complete` only after session minting succeeds when `session` is provided.

2) TouchID fallback (VRF locked)
- Prompt 1: collect a WebAuthn assertion (any challenge) and call `unlockVRFKeypair({ credential })` to decrypt the VRF (PRF‑based).
- If `withSession` is true:
  - Fetch latest block context.
  - Build a fresh VRF challenge.
  - Prompt 2: collect a VRF‑anchored WebAuthn assertion and POST to relay to mint the session.
  - SDK emits `login-complete` only after session minting succeeds when `session` is provided.
- Alternative UX: defer session minting until first API call to avoid a second prompt at login time.

Notes
- The contract must only accept VRF inputs constructed with recent block height/hash and your domain separator; stale inputs are rejected.
- You cannot reuse the first PRF assertion for verification in the fallback path because the VRF challenge cannot be produced until after decrypting the VRF key.

## Payloads
- Client → relay body matches server types in `sdk/src/server/core/types.ts`:
  - `vrf_data: { vrf_input_data, vrf_output, vrf_proof, public_key, user_id, rp_id, block_height, block_hash }` (number[])
  - `webauthn_authentication: { id, rawId, type, authenticatorAttachment, response: { clientDataJSON, authenticatorData, signature, userHandle }, clientExtensionResults }`
- Use the same marshaling logic as registration (see `sdk/src/core/PasskeyManager/faucets/createAccountRelayServer.ts`) to convert base64url → number[].

## Client Implementation Notes
- `sdk/src/core/PasskeyManager/login.ts`
  - Accepts optional `session` config and executes the session call after VRF unlock.
  - Shamir branch: single WebAuthn assertion for session verification.
  - Fallback branch: one assertion to unlock, and when `session` is provided, a second assertion to verify the session; or defer by omitting `session`.
  - Calls `verifyAuthenticationResponse(relayUrl, route, kind, vrfChallenge, credential)`.
  - When `session` is provided, the SDK defers emitting the final `login-complete` event (and afterCall) until session verification succeeds; on failure it emits `login-error`.
- Challenge source
  - Use `NonceManager.getNonceBlockHashAndHeight` to fetch fresh block, then `webAuthnManager.generateVrfChallenge({ userId, rpId, blockHeight, blockHash })`.
- Keep current behavior for updating last login, VRF session checks, and proactive Shamir refresh.

## Relay/Server Implementation Tasks
- Route (Express & Cloudflare):
  - Ensure a `POST /verify-authentication-response` route exists and calls `AuthService.verifyAuthenticationResponse`.
- Service (`sdk/src/server/core/AuthService.ts`):
  - `verifyAuthenticationResponse` is a VIEW call (no gas):
    - `nearClient.view({ account: webAuthnContractId, method: 'verify_authentication_response', args })`.
    - Parse result and set `verified: boolean`.
  - Session issuance is handled by routers when a SessionService adapter is provided.
- Cloudflare adaptor / Express adaptor
  - Use the provided routers and pass a SessionService via options when you want sessions.
  - Confirm CORS rules; avoid logging sensitive fields; add rate limiting.

### SessionService cookie hooks (optional)

```ts
import { SessionService } from '@tatchi-xyz/sdk/server';

const session = new SessionService({
  jwt: { /* signToken/verifyToken hooks */ },
  cookie: {
    name: 'w3a_session',
    buildSetHeader: (token) => [
      `w3a_session=${token}`,
      'Path=/', 'HttpOnly', 'Secure', 'SameSite=None', 'Max-Age=86400'
    ].join('; '),
    buildClearHeader: () => [
      'w3a_session=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=None',
      'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ].join('; '),
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

## Security Considerations
- Freshness window: enforce a tight height/time window in the contract VIEW and/or relay policies.
- rpId binding: ensure the rpId used in VRF input matches the allowed origin policies.
- Session issuance (via routers + SessionService):
  - Cookies: defaults are HttpOnly + Secure + SameSite=Lax (customize via SessionService cookie hooks). Rotate signing keys; short TTL.
  - JWT: include `sub = nearAccountId`, `aud` for your API; sign with HMAC/RSA; short TTL.
- Shamir endpoints: keep strict `keyId`, throttle remove‑server‑lock, and prune grace keys quickly.
- Logging: do not log full WebAuthn or VRF payloads; log request IDs and coarse outcomes only.

## Rollout Plan
1) Server: convert `AuthService.verifyAuthenticationResponse` to a VIEW call; return `{ success, verified, jwt? }`.
2) Server: ensure `/verify-authentication-response` routes are exposed in both Express and Cloudflare adaptors.
3) Client: add `withSession` mode (or a `loginWithSession` wrapper) that runs the relay call right after unlock.
4) QA: 
   - Shamir path: verify single‑prompt sessionized login.
   - Fallback path: verify either (a) two‑prompt login with session, or (b) one‑prompt login + deferred session at first API call.
   - Validate rpId/recency rejections and cookie/JWT issuance.
5) Observability: add metrics for verify attempts, success rate, recency rejections, and Shamir → TouchID fallback rates.

## Nice‑to‑Have Enhancements
- Deferrable session helper: a small client function that triggers the VRF‑anchored verify only when backend endpoints return 401.
- Configurable recency policy exposed via the contract or a view method for UI diagnostics.
- Health endpoint that returns current Shamir `keyId`, allowed origins, and contract `view` reachability.
