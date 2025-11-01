---
title: Cloudflare Worker
---

# Cloudflare Worker

Deploy the relay (AuthService) to Cloudflare Workers. This runs the same APIs as the Node/Express example but packaged for Cloudflare’s runtime, with WASM modules bundled and no filesystem access.

## Requirements

- Cloudflare account + `wrangler` CLI (`npm i -g wrangler`)
- Node 18+

## Project layout

- Source: `examples/relay-cloudflare-worker/`
- Entrypoint: `src/worker.ts`
- Config: `wrangler.toml`

`src/worker.ts` initializes `AuthService` and wires Cloudflare adapters:

```ts
import { AuthService } from '@tatchi-xyz/sdk/server'
import { createCloudflareRouter, createCloudflareCron } from '@tatchi-xyz/sdk/server/router/cloudflare'
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer'
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf'

// ... construct AuthService with signerWasm.moduleOrPath and shamir.moduleOrPath
// Router exposes relay endpoints; optional scheduled() enables rotations
```

## WASM bundling (Cloudflare)

- Workers can’t resolve `import.meta.url` to fetch `.wasm` at runtime. Pass modules via config.
- We import WASM modules directly from the SDK and hand them to `AuthService`:
  - `signerWasm: { moduleOrPath: signerWasmModule }`
  - `shamir.moduleOrPath = shamirWasmModule`
- `wrangler.toml` includes esbuild rules so `.wasm` is bundled:

```toml
[[rules]]
type = "CompiledWasm"
globs = ["**/*.wasm"]
fallthrough = true
```

See also: [Cloudflare WASM Imports](/docs/guides/cloudflare-wasm-imports).

## Configuration

Set non-secret vars in `wrangler.toml` under `[vars]` and secrets with `wrangler secret put`.

Required vars (wrangler.toml → [vars])
- `RELAYER_ACCOUNT_ID`: NEAR account used to send txs
- `NEAR_RPC_URL`: RPC endpoint (e.g. https://test.rpc.fastnear.com)
- `NETWORK_ID`: `testnet` or `mainnet` (defaults to `testnet` if omitted)
- `WEBAUTHN_CONTRACT_ID`: contract handling registration/auth
- `ACCOUNT_INITIAL_BALANCE`: yoctoNEAR for new accounts (default `30000000000000000000000`)
- `CREATE_ACCOUNT_AND_REGISTER_GAS`: gas for atomic create+register (default `85000000000000`)
- Optional CORS: `EXPECTED_ORIGIN`, `EXPECTED_WALLET_ORIGIN` (comma-separated list of allowed origins)
- Optional rotation: `ENABLE_ROTATION="1"` and add a cron in `[triggers]`

Required secrets
- `RELAYER_PRIVATE_KEY`
- `SHAMIR_P_B64U`, `SHAMIR_E_S_B64U`, `SHAMIR_D_S_B64U`

Commands
```bash
wrangler login                        # authenticate once
wrangler secret put RELAYER_PRIVATE_KEY
wrangler secret put SHAMIR_P_B64U
wrangler secret put SHAMIR_E_S_B64U
wrangler secret put SHAMIR_D_S_B64U
```

## Build and deploy

```bash
cd examples/relay-cloudflare-worker
pnpm i
wrangler deploy
```

Local testing
- Use `wrangler dev --remote` to exercise WASM in the real runtime
- Tail logs: `wrangler tail`

## Endpoints

The router exposes the relay API used by the SDK:
- `POST /vrf/apply-server-lock`
- `POST /vrf/remove-server-lock`
- `GET  /shamir/key-info`
- Optional health: `GET /healthz`

## Troubleshooting

- “Invalid URL string.” during WASM init
  - Cause: runtime tried to build a URL from `import.meta.url` and fetch the wasm
  - Fix: ensure `signerWasm.moduleOrPath` and `shamir.moduleOrPath` are passed (see `src/worker.ts`), and `.wasm` bundling rule exists in `wrangler.toml`
- CORS errors
  - Set `EXPECTED_ORIGIN` and/or `EXPECTED_WALLET_ORIGIN` to your allowed origins (comma-separated)

## Reference

- Example worker config: `examples/relay-cloudflare-worker/wrangler.toml`
- Worker source: `examples/relay-cloudflare-worker/src/worker.ts`
- Related guide: [Cloudflare WASM Imports](/docs/guides/cloudflare-wasm-imports)
- CI/CD: [Cloudflare + GitHub Actions](/docs/guides/cloudflare-github-actions-setup)

