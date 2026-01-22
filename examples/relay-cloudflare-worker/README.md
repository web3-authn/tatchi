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
  (`import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer'` and
  `import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf'`).
  Wrangler bundles the referenced files automatically; no `[wasm_modules]`
  section is required in `wrangler.toml`.
- Do **not** try to `fetch` the WASM from an arbitrary URL at runtime. Workers
  sit behind restricted networking rules and cannot access `file://` or other
  private origins.

## Configuration and secrets

- **Worker secrets** (sensitive) must be added via `wrangler secret put` (or the
  Cloudflare dashboard). They are not stored in `wrangler.toml`:
  - Required:
    - `RELAYER_PRIVATE_KEY`
    - `SHAMIR_P_B64U`, `SHAMIR_E_S_B64U`, `SHAMIR_D_S_B64U`
  - Optional:
    - `THRESHOLD_ED25519_MASTER_SECRET_B64U` (enables 2-party threshold signing)
- **Worker vars** (non-secret) can be set in `wrangler.toml` `[vars]`, in the
  Cloudflare dashboard, or at deploy-time via `wrangler deploy --var ...`:
  - CORS allowlist (recommended to set explicitly if you use cookies):
    - `EXPECTED_ORIGIN` (e.g. docs/app origin)
    - `EXPECTED_WALLET_ORIGIN` (e.g. wallet iframe origin)
  - Chain/runtime config (see `wrangler.toml` defaults):
    - `RELAYER_ACCOUNT_ID`, `WEBAUTHN_CONTRACT_ID`, `NETWORK_ID`, `NEAR_RPC_URL`, etc.
- If you enable Shamir rotation, configure the cron schedule in `[triggers]`
  and set `ENABLE_ROTATION="1"`.

### Threshold signing (optional)

Threshold signing endpoints are enabled only when you provide:
- `THRESHOLD_ED25519_MASTER_SECRET_B64U` (32 bytes, base64url) via `wrangler secret put`.

You do **not** set this via `--var` (it’s a secret).

Cloudflare-native persistence
- This example uses a **Durable Object** to persist threshold auth sessions + FROST signing sessions.
- Configure the base key prefix in `wrangler.toml` (or dashboard):
  - `THRESHOLD_PREFIX` (e.g. `tatchi:prod:w3a`)
  - Optional: `THRESHOLD_ED25519_SHARE_MODE=derived` (recommended for serverless)

### Session configuration (optional)

The Worker mints sessions only when you provide a SessionService. No JWT library
is bundled — you supply minimal sign/verify hooks. Cookies default to
`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=24h` and can be customized via
cookie hooks.

Example hooks used in this example Worker entry:

```ts
const session = new SessionService({
  jwt: {
    // Important: if `payload.exp` is provided (e.g. for threshold-session tokens), do not override it with `expiresIn`.
    signToken: ({ payload }) => {
      const hasPayloadExp = typeof (payload as { exp?: unknown }).exp === 'number';
      return jwt.sign(payload as any, env.JWT_SECRET || 'dev-token', {
        algorithm: 'HS256',
        issuer: 'relay-worker-demo',
        audience: 'tatchi-app-demo',
        ...(hasPayloadExp ? {} : { expiresIn: 86400 }),
      });
    },
    verifyToken: async (token) => { try { return { valid: true, payload: jwt.verify(token, env.JWT_SECRET || 'dev-token') }; } catch { return { valid: false }; } }
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

1. From the repo root:
   - Install workspace deps: `pnpm install`
   - Build the SDK (required for the Worker bundle): `pnpm build:sdk-prod`
2. Authenticate: `npx wrangler login` or `npx wrangler config` with an API
   token.
3. Provision required secrets (repeat for each environment you deploy):
   ```bash
   # staging env (w3a-relay-staging)
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put RELAYER_PRIVATE_KEY --env staging
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put SHAMIR_P_B64U --env staging
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put SHAMIR_E_S_B64U --env staging
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put SHAMIR_D_S_B64U --env staging

   # production env (w3a-relay-prod)
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put RELAYER_PRIVATE_KEY --env production
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put SHAMIR_P_B64U --env production
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put SHAMIR_E_S_B64U --env production
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put SHAMIR_D_S_B64U --env production
   ```
4. Optional: provision threshold signing secret (repeat per environment):
   ```bash
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put THRESHOLD_ED25519_MASTER_SECRET_B64U --env staging
   pnpm -C examples/relay-cloudflare-worker exec wrangler secret put THRESHOLD_ED25519_MASTER_SECRET_B64U --env production
   ```
5. Deploy:
   ```bash
   pnpm -C examples/relay-cloudflare-worker exec wrangler deploy --env staging
   pnpm -C examples/relay-cloudflare-worker exec wrangler deploy --env production
   ```
6. Tail logs during testing:
   ```bash
   pnpm -C examples/relay-cloudflare-worker exec wrangler tail --env staging
   pnpm -C examples/relay-cloudflare-worker exec wrangler tail --env production
   ```

### CORS allowlist (recommended)

If you want cookie-based sessions (`credentials: 'include'`), you must use an
explicit allowlist (not `Access-Control-Allow-Origin: *`).

Example mapping:
- staging: `EXPECTED_ORIGIN=https://staging.tatchi.xyz`, `EXPECTED_WALLET_ORIGIN=https://wallet-staging.web3authn.org`
- prod: `EXPECTED_ORIGIN=https://tatchi.xyz`, `EXPECTED_WALLET_ORIGIN=https://wallet.web3authn.org`

## Local testing tips

- Use `wrangler dev --remote` to run against a real edge runtime. The local
  Miniflare-based dev server cannot emulate the WASM bundling behaviour.
- The Worker logs detailed signer WASM initialization errors. If you see
  a WASM init/import error, re-run `pnpm build:sdk-prod` and verify
  `examples/relay-cloudflare-worker/wrangler.toml` includes the `CompiledWasm`
  `[[rules]]` entry for `**/*.wasm`.
