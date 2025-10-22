# Deployment Plan: Split Targets Across Two Workflows

Goal
- `deploy-cloudflare.yml` (production):
  - Deploy wallet iframe to `wallet.tatchi.xyz`.
  - Deploy main site/docs to `tatchi.xyz` (or your primary Pages project).
- `deploy-separate-wallet-host.yml` (web3authn/hosted):
  - Deploy wallet iframe to `web3authn.org`.
  - Deploy hosted demo app to `hosted.tatchi.xyz`.

## Environments & Projects

- GitHub Environments
  - `production` → tatchi.xyz site and wallet.tatchi.xyz wallet
  - `web3authn` → web3authn.org wallet
  - `hosted` → hosted.tatchi.xyz app

- Cloudflare Pages Projects (example names)
  - `CF_PAGES_PROJECT_VITE` (production env) → tatchi.xyz
  - `CF_PAGES_PROJECT_WALLET` (production env) → wallet-tatchi
  - `CF_PAGES_PROJECT_WALLET` (web3authn env) → web3authn
  - `CF_PAGES_PROJECT_HOSTED` (hosted env) → hosted-tatchi

## Required GitHub Secrets/Vars per Environment

- Common Secrets (all envs)
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

- production (tatchi.xyz, wallet.tatchi.xyz)
  - Secrets: `CF_PAGES_PROJECT_VITE`, `CF_PAGES_PROJECT_WALLET`, optional `R2_*` if publishing SDK.
  - Vars (VITE_* for docs/site build):
    - `VITE_WALLET_ORIGIN=https://wallet.tatchi.xyz`
    - `VITE_WALLET_SERVICE_PATH=/wallet-service/`
    - `VITE_SDK_BASE_PATH=/sdk`
    - `VITE_RP_ID_BASE=tatchi.xyz`
    - `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, optional `VITE_NEAR_*`

- web3authn (web3authn.org)
  - Secrets: `CF_PAGES_PROJECT_WALLET` (e.g., `web3authn`), optional `R2_*` if publishing SDK for this env.
  - Vars:
    - `VITE_WALLET_ORIGIN=https://web3authn.org`
    - `VITE_WALLET_SERVICE_PATH=/wallet-service/`
    - `VITE_SDK_BASE_PATH=/sdk`
    - `VITE_RP_ID_BASE=web3authn.org`
    - `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, optional `VITE_NEAR_*`

- hosted (hosted.tatchi.xyz)
  - Secrets: `CF_PAGES_PROJECT_HOSTED` (e.g., `hosted-tatchi`).
  - Vars (hosted uses wallet at web3authn.org):
    - `VITE_WALLET_ORIGIN=https://web3authn.org`
    - `VITE_WALLET_SERVICE_PATH=/wallet-service/`
    - `VITE_SDK_BASE_PATH=/sdk`
    - `VITE_RP_ID_BASE=web3authn.org`
    - `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, optional `VITE_NEAR_*`

## Workflow Mapping & Minimal Changes

### 1) deploy-cloudflare.yml (production)

- Purpose: build SDK, publish SDK to R2 (optional), deploy relay Worker, deploy docs/site to `tatchi.xyz`, deploy wallet-only static site to `wallet.tatchi.xyz`.
- Recommended tweaks:
  - Deploy wallet job on push for production only (avoid double-deploys with the separate workflow):
    - Set `environment: production` and add `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` (or gate by matrix when present).
  - Keep `deploy-pages` steps gated to production (already step-level if).
  - Optionally run `publish-sdk-r2` and `deploy-worker` for production only to reduce matrix noise.
  - Rely on the Vite build plugin to emit `dist/_headers` and `dist/wallet-service/index.html` (if missing). No YAML heredocs are required.
  - Ensure the wallet example build uses `tatchiBuildHeaders({ walletOrigin })` and that env vars (`VITE_WALLET_ORIGIN`, optional `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`) are set on the Pages project.

### 2) deploy-separate-wallet-host.yml (web3authn + hosted)

- Purpose: deploy wallet-only static site to `web3authn.org` and hosted demo app to `hosted.tatchi.xyz`.
- Jobs:
  - `deploy-wallet-host` → `environment: web3authn`
    - Build SDK; build wallet example (required; job fails if missing).
    - Copy `sdk/dist/esm/sdk/*` → `/sdk`, `sdk/dist/workers/*` → `/sdk/workers`.
    - The build plugin emits `_headers` (COOP/COEP + Permissions‑Policy + SDK CORS) and writes `wallet-service/index.html` if the app didn’t provide one.
    - Deploy to `CF_PAGES_PROJECT_WALLET` (web3authn).
  - `deploy-hosted-app` → `environment: hosted`
    - Build SDK; build `examples/vite` with VITE_* pointing to `web3authn.org`.
    - Deploy to `CF_PAGES_PROJECT_HOSTED` (hosted-tatchi).
  - Do not pass `gitHubToken` to pages-action to avoid creating confusing "(Production)" deployment environments.

## Relay CORS (Shared Worker)

- Cloudflare Worker ENV (set via dashboard or Wrangler):
  - `EXPECTED_ORIGIN = https://hosted.tatchi.xyz, https://tatchi.xyz`
  - `EXPECTED_WALLET_ORIGIN = https://web3authn.org, https://wallet.tatchi.xyz`
  - Worker parses CSV, canonicalizes (protocol + lowercase host + optional port), merges, and applies allowlist.
- Diagnostics:
  - `GET /healthz` returns `{ ok: true, cors: { allowedOrigins: [...] } }`.
  - Preflight (should include `Access-Control-Allow-Origin` for tested Origin):
    - `curl -i -X OPTIONS https://relay.tatchi.xyz/create_account_and_register_user -H 'Origin: https://web3authn.org' -H 'Access-Control-Request-Method: POST'`

## Host‑App Runtime Guardrails

- Provider hook sets absolute embedded base so srcdoc iframes load ESM from the wallet origin:
  - `window.__W3A_EMBEDDED_BASE__ = new URL(sdkBasePath + '/', walletOrigin).toString()`
  - Emits `W3A_EMBEDDED_BASE_SET` (Lit host re-initializes if needed).
- Wallet site must serve:
  - `/sdk/wallet-iframe-host.js` (200, JS)
  - `/sdk/w3a-button-with-tooltip.js` (200, JS)
  - `/sdk/workers/web3authn-signer.worker.js` (200, JS)
  - `/sdk/workers/wasm_signer_worker_bg.wasm` (200, application/wasm)

## Validation Checklist

1) Wallet assets
   - `curl -I https://wallet.tatchi.xyz/sdk/wallet-iframe-host.js` → 200
   - `curl -I https://web3authn.org/sdk/wallet-iframe-host.js` → 200
   - Verify `/sdk/workers/*` and `.wasm` MIME.

2) Module CORS
   - `curl -I https://web3authn.org/sdk/w3a-button-with-tooltip.js | grep -i access-control-allow-origin`
   - `curl -I https://web3authn.org/sdk/workers/web3authn-signer.worker.js | grep -i access-control-allow-origin`

3) Relay preflight
   - OPTIONS preflight from both `https://web3authn.org` and `https://hosted.tatchi.xyz` includes `Access-Control-Allow-Origin`.

4) ROR manifest
   - `GET https://web3authn.org/.well-known/webauthn` includes `https://hosted.tatchi.xyz`.

5) UI Ready
   - In hosted app, the iframe embed renders `<w3a-button-with-tooltip>` with populated shadowRoot (inspect in Elements pane).

## Common Gotchas

- Trailing slash on `sdkBasePath` when constructing URLs; always resolve as `${sdkBasePath}/...`.
- Wallet service path `/wallet-service` may 308 → `/wallet-service/`; both are supported. Use the trailing slash to avoid the redirect.
- Missing CORS for `/sdk/*` or `/sdk/workers/*` will cause "module script … text/html" errors due to SPA 404 fallbacks.
- Missing `__W3A_EMBEDDED_BASE__` yields asset fetches from the host app origin and inert `<w3a-*>` tags.

---

This plan keeps production and demo deployments separate, reuses a single relay with a strict origin allowlist, and adds CI‑friendly diagnostics to spot misconfigurations rapidly.
