# Deployment Overview

This document maps what gets deployed, to which GitHub Environments, with which env vars and secrets, and by which workflow YAML.

## GitHub Environments

- production
  - Primary site/docs (tatchi.xyz) and wallet host (wallet.tatchi.xyz)
  - SDK bundles published to R2
  - Relay Cloudflare Worker
- web3authn
  - Wallet host for web3authn.org
- hosted
  - Hosted demo app (hosted.tatchi.xyz)

## Workflows → Deployments

- .github/workflows/deploy-cloudflare.yml
  - Triggers: push to main, manual dispatch
  - Jobs and outputs (Environment: production)
    - publish-sdk-r2
      - What: Publish `sdk/dist` artifacts to Cloudflare R2 under `releases/<sha>` (and `releases/<tag>` on tags) with a signed manifest
      - Secrets: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
    - deploy-worker
      - What: Deploy Relay Cloudflare Worker from `examples/relay-cloudflare-worker`
      - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
      - Notes: Runtime Worker vars/secrets are configured in Cloudflare (not GitHub); see /docs/guides/cloudflare-github-actions-setup
    - deploy-pages
      - What: Deploy docs/site from `examples/tatchi-docs/dist/docs` to Cloudflare Pages
      - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_VITE`
      - Vars (from Environment → vars): `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`, `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`, `VITE_NEAR_EXPLORER`, `VITE_WEBAUTHN_CONTRACT_ID`
    - deploy-wallet
      - What: Deploy wallet static site built from `examples/vite/dist` to Cloudflare Pages
      - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_WALLET`
      - Vars (from Environment → vars): `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`, `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`, `VITE_NEAR_EXPLORER`

- .github/workflows/deploy-separate-wallet-host.yml
  - Triggers: push to main, manual dispatch
  - Jobs and outputs
    - deploy-wallet-host (Environment: web3authn)
      - What: Deploy wallet static site from `examples/vite/dist` to Cloudflare Pages (web3authn.org)
      - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_WALLET`
      - Vars (Environment → vars): `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`, `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`, `VITE_NEAR_EXPLORER`
    - deploy-hosted-app (Environment: hosted)
      - What: Deploy hosted demo app from `examples/vite/dist` to Cloudflare Pages (hosted.tatchi.xyz)
      - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_HOSTED`
      - Vars (Environment → vars): `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`, `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`, `VITE_NEAR_EXPLORER`

## Environment Vars (vars) by Environment

- production
  - VITE_WALLET_ORIGIN = https://wallet.tatchi.xyz
  - VITE_WALLET_SERVICE_PATH = /wallet-service/
  - VITE_SDK_BASE_PATH = /sdk
  - VITE_RP_ID_BASE = tatchi.xyz
  - VITE_RELAYER_URL, VITE_RELAYER_ACCOUNT_ID
  - VITE_NEAR_NETWORK, VITE_NEAR_RPC_URL, VITE_NEAR_EXPLORER
  - VITE_WEBAUTHN_CONTRACT_ID (if required by docs)

- web3authn
  - VITE_WALLET_ORIGIN = https://web3authn.org
  - VITE_WALLET_SERVICE_PATH = /wallet-service/
  - VITE_SDK_BASE_PATH = /sdk
  - VITE_RP_ID_BASE = web3authn.org
  - VITE_RELAYER_URL, VITE_RELAYER_ACCOUNT_ID
  - VITE_NEAR_NETWORK, VITE_NEAR_RPC_URL, VITE_NEAR_EXPLORER

- hosted
  - VITE_WALLET_ORIGIN = https://web3authn.org
  - VITE_WALLET_SERVICE_PATH = /wallet-service/
  - VITE_SDK_BASE_PATH = /sdk
  - VITE_RP_ID_BASE = web3authn.org
  - VITE_RELAYER_URL, VITE_RELAYER_ACCOUNT_ID
  - VITE_NEAR_NETWORK, VITE_NEAR_RPC_URL, VITE_NEAR_EXPLORER

## Secrets by Environment

- Common (all environments)
  - CLOUDFLARE_API_TOKEN
  - CLOUDFLARE_ACCOUNT_ID

- production
  - CF_PAGES_PROJECT_VITE (docs/site)
  - CF_PAGES_PROJECT_WALLET (wallet host)
  - R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (for SDK bundle publishing)

- web3authn
  - CF_PAGES_PROJECT_WALLET (wallet host for web3authn.org)

- hosted
  - CF_PAGES_PROJECT_HOSTED (hosted demo app)

## Tools/Actions Used

- Wrangler CLI for Pages and Worker deploys in production (deploy-cloudflare.yml)
- cloudflare/pages-action in separate wallet/hosted workflow
- SDK is built in each job before deployment; SDK runtime assets are copied into Pages output under `/sdk` and `/sdk/workers`

## Notes

- Worker runtime configuration (RELAYER_*, NEAR_*, EXPECTED_ORIGIN, etc.) lives in Cloudflare and is not managed as GitHub secrets. See /docs/guides/cloudflare-github-actions-setup for the full list.
- There is an optional npm publish job in deploy-cloudflare.yml (commented out). Enable and provide `NPM_TOKEN` if you want automatic publishes on tags.
