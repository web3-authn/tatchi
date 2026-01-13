# Deployment Overview

This document maps what gets deployed, to which GitHub Environments, with which env vars and secrets, and by which workflow YAML.

## GitHub Environments

- staging
  - Staging deployments from `dev` (Cloudflare resources use `*-staging` names)
  - Relay Worker + Email Routing (staging)
  - Docs Pages project (staging)
  - Wallet iframe Pages project (staging.web3authn.org)
- production
  - Production deployments from `main` (Cloudflare resources use `*-prod` names)
  - Relay Worker + Email Routing (prod)
  - Docs Pages project (prod)
  - Wallet iframe Pages project (web3authn.org)

## Workflows → Deployments

- .github/workflows/publish-sdk-r2.yml
  - Triggers: push to `main`/`dev`, tag pushes `v*`, manual dispatch
  - What: Publish `sdk/dist` artifacts to Cloudflare R2 (sha256 manifest + cosign signature)
  - Default prefixes:
    - `main`: `releases/<sha>`
    - `dev`: `releases-dev/<sha>`
    - `v*` tags: also publish `releases/<tag>`
  - Secrets: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

- .github/workflows/deploy-relay-staging.yml
  - Triggers: push to `dev`, manual dispatch
  - Environment: `staging`
  - What: Deploy relay Cloudflare Worker from `examples/relay-cloudflare-worker` as `w3a-relay-staging` and configure Email Routing
  - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`
  - Vars: `RECOVER_EMAIL_RECIPIENT`

- .github/workflows/deploy-relay-prod.yml
  - Triggers: push to `main`, manual dispatch
  - Environment: `production`
  - What: Deploy relay Cloudflare Worker from `examples/relay-cloudflare-worker` as `w3a-relay-prod` and configure Email Routing
  - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`
  - Vars: `RECOVER_EMAIL_RECIPIENT`

- .github/workflows/deploy-docs-staging.yml
  - Triggers: push to `dev`, manual dispatch
  - Environment: `staging`
  - What: Build VitePress docs and deploy to Cloudflare Pages project `w3a-tatchi-docs-staging`

- .github/workflows/deploy-docs-prod.yml
  - Triggers: push to `main`, manual dispatch
  - Environment: `production`
  - What: Build VitePress docs and deploy to Cloudflare Pages project `w3a-tatchi-docs-prod`

- .github/workflows/deploy-wallet-iframe-staging.yml
  - Triggers: push to `dev`, manual dispatch
  - Environment: `staging`
  - What: Build `examples/vite` wallet iframe and deploy to Cloudflare Pages project `w3a-wallet-iframe-staging` (staging.web3authn.org)

- .github/workflows/deploy-wallet-iframe-prod.yml
  - Triggers: push to `main`, manual dispatch
  - Environment: `production`
  - What: Build `examples/vite` wallet iframe and deploy to Cloudflare Pages project `w3a-wallet-iframe-prod` (web3authn.org)

- Legacy (to remove after cutover)
  - `.github/workflows/deploy-cloudflare.yml`
  - `.github/workflows/deploy-docs-dev.yml`

## Environment Vars (vars) by Environment

- staging / production
  - `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`
  - `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`
    - production: `https://relay.tatchi.xyz`
    - staging: `https://relay-staging.tatchi.xyz`
  - `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`, `VITE_NEAR_EXPLORER`
  - `VITE_WEBAUTHN_CONTRACT_ID` (if required by docs)
  - `RECOVER_EMAIL_RECIPIENT` (used by relay deploy workflows)

## Secrets by Environment

- Common (all environments)
  - CLOUDFLARE_API_TOKEN
  - CLOUDFLARE_ACCOUNT_ID

- staging / production
  - R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (for SDK bundle publishing)
  - CLOUDFLARE_ZONE_ID (required for Email Routing configuration in relay deploy workflows)

## Tools/Actions Used

- Wrangler CLI for Pages and Worker deploys (staging + production)
- cloudflare/pages-action in legacy workflow `.github/workflows/deploy-docs-dev.yml` (to be removed)
- SDK is built in each job before deployment; SDK runtime assets are copied into Pages output under `/sdk` and `/sdk/workers`

## Notes

- Worker runtime configuration (RELAYER_*, NEAR_*, EXPECTED_ORIGIN, etc.) lives in Cloudflare and is not managed as GitHub secrets. See /docs/guides/cloudflare-github-actions-setup for the full list.
- There is an optional npm publish job in deploy-cloudflare.yml (commented out). Enable and provide `NPM_TOKEN` if you want automatic publishes on tags.


## Cloudflare Pages Mappings

Cloudflare pages/workers mappings are as follows:
- `w3a-wallet-iframe-prod` -> `wallet.web3authn.org`
- `w3a-wallet-iframe-staging` -> `wallet-staging.web3authn.org`
- `w3a-tatchi-docs-prod` -> `tatchi.xyz`
- `w3a-tatchi-docs-staging` -> `staging.tatchi.xyz`
- `w3a-relay-prod` -> `relay.tatchi.xyz`
- `w3a-relay-staging` -> `relay-staging.tatchi.xyz`