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
  (`import signerWasm from '@web3authn/passkey/src/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm'`).
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
