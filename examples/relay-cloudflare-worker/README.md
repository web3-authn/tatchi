# Cloudflare Relay Worker Notes

This Worker packages the relay server logic for Cloudflare's runtime. That
runtime differs from Node.js in a few important ways, so the Worker has some
extra requirements and limitations compared to the Express example.

## Runtime constraints

- **No filesystem access.** Workers cannot read from or write to a local fs.
  Any configuration that expects `fs.readFile` (e.g. `grace-keys.json`) must be
  provided via environment variables, KV/DO bindings, or omitted entirely. The
  Worker sets `graceShamirKeysFile` to an empty string for this reason.
- **No `process`, `__dirname`, or path resolution.** Relative URLs based on
  `import.meta.url` work in bundlers, but they resolve to `about:blank` inside a
  Worker bundle. AuthService now accepts a `signerWasm` override so the Worker
  can inject the WASM module directly.
- **Limited Web APIs only.** Use the WHATWG Fetch API and other browser-style
  globals. Node-only modules (net, tls, fs, path, etc.) are unavailable unless
  polyfilled by Wrangler's `nodejs_compat`, and even then many functions throw.

## WASM bundling

- The signer worker WASM is imported directly from the package sources
  (`import signerWasm from '@tatchi/core/wasm'`).
  Wrangler bundles the referenced file automatically; no `[wasm_modules]`
  section is required in `wrangler.toml`.
- Do **not** try to `fetch` the WASM from an arbitrary URL at runtime. Workers
  sit behind restricted networking rules and cannot access `file://` or other
  private origins.

## Configuration and secrets

- Secrets such as `RELAYER_PRIVATE_KEY`, `SHAMIR_*` values, and any optional
  JWT configuration must be added via `wrangler secret put`. They are not stored
  in `wrangler.toml`.
- Optional CORS settings (`EXPECTED_ORIGIN`, `EXPECTED_WALLET_ORIGIN`) can be
  set in `wrangler.toml` vars.
- If you enable Shamir rotation, configure the cron schedule in `[triggers]`
  and set `ENABLE_ROTATION="1"`.

### Session configuration (optional)

The Worker mints sessions only when you provide a SessionService. No JWT library
is bundled — you supply minimal sign/verify hooks. Cookies default to
`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=24h` and can be customized via
cookie hooks.

Example hooks used in this example Worker entry:

```ts
const session = new SessionService({
  jwt: {
    signToken: ({ payload }) => jwt.sign(payload as any, env.JWT_SECRET || 'dev-insecure', {
      algorithm: 'HS256', issuer: 'relay-worker-demo', audience: 'tatchi-app-demo', expiresIn: 86400
    }),
    verifyToken: async (token) => { try { return { valid: true, payload: jwt.verify(token, env.JWT_SECRET || 'dev-insecure') }; } catch { return { valid: false }; } }
  },
  // Minimal cookie config (defaults are fine for Lax; customize with hooks below if needed)
  cookie: { name: 'w3a_session' }
});
```

Custom cookie headers (optional):

```ts
const session = new SessionService({
  jwt: { /* sign/verify as above */ },
  cookie: {
    name: 'w3a_session',
    buildSetHeader: (token) => [
      `w3a_session=${token}`,
      'Path=/', 'HttpOnly', 'Secure', 'SameSite=None', 'Max-Age=86400'
    ].join('; '),
    buildClearHeader: () => [
      'w3a_session=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=None',
      'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ].join('; ')
  }
});
```

## Session verification (JWT or HttpOnly cookie)

- Endpoint: `POST /verify-authentication-response`
- Request body:
  ```json
  {
    "sessionKind": "jwt" | "cookie",
    "vrf_data": { /* ContractVrfData */ },
    "webauthn_authentication": { /* WebAuthn assertion */ }
  }
  ```
- Behavior:
  - `sessionKind: "jwt"` → JSON response includes `{ success, verified, jwt }`.
  - `sessionKind: "cookie"` → sets `Set-Cookie: w3a_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/` and omits `jwt` in body.

Cookie mode and CORS
- Pass raw env origins to the router: it normalizes CSV/duplicates internally and only
  advertises `Access-Control-Allow-Credentials: true` when echoing a specific `Origin`.
- Set `EXPECTED_ORIGIN` (and/or `EXPECTED_WALLET_ORIGIN`) to explicit origins; avoid `*` when using cookies.
- Your frontend fetch must include credentials in cookie mode:
  ```ts
  await fetch(`${relay}/verify-authentication-response`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionKind: 'cookie', vrf_data, webauthn_authentication })
  });
  ```

## Deployment checklist

1. `pnpm install` (once) inside `examples/relay-cloudflare-worker/`.
2. Authenticate: `npx wrangler login` or `npx wrangler config` with an API
   token.
3. Provision secrets:
   ```bash
   npx wrangler secret put RELAYER_PRIVATE_KEY
   npx wrangler secret put SHAMIR_P_B64U
   npx wrangler secret put SHAMIR_E_S_B64U
   npx wrangler secret put SHAMIR_D_S_B64U
   ```
4. Deploy: `npx wrangler deploy` (Wrangler will bundle the SDK WASM automatically).
5. Tail logs during testing: `npx wrangler tail`.

## Local testing tips

- Use `wrangler dev --remote` to run against a real edge runtime. The local
  Miniflare-based dev server cannot emulate the WASM bundling behaviour.
- The Worker logs detailed signer WASM initialization errors. If you see
  `Missing SIGNER_WASM module`, verify the `[wasm_modules]` binding and redeploy.
