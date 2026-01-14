---
title: Cloudflare + GitHub Actions
---

# Cloudflare & GitHub Actions Setup Guide

This guide walks you through setting up Cloudflare and GitHub Actions for the deployment pipeline (Cloudflare Pages + Workers), using split workflows and separate staging/production resources.

## Overview

This repo uses separate workflows per deployable:

- **Relay (Cloudflare Worker)**: `examples/relay-cloudflare-worker`
- **Docs site (Cloudflare Pages)**: `examples/tatchi-docs`
- **Wallet iframe (Cloudflare Pages)**: `examples/vite`
- **Optional**: publish signed SDK runtime bundles to **Cloudflare R2** (artifact storage)

## What Gets Deployed

### Cloudflare Pages/Workers mappings

- `w3a-wallet-iframe-prod` → `wallet.web3authn.org`
- `w3a-wallet-iframe-staging` → `wallet-staging.web3authn.org`
- `w3a-tatchi-docs-prod` → `tatchi.xyz`
- `w3a-tatchi-docs-staging` → `staging.tatchi.xyz`
- `w3a-relay-prod` → `relay.tatchi.xyz`
- `w3a-relay-staging` → `relay-staging.tatchi.xyz`

### GitHub Environments

We use two GitHub Environments, each with its own secrets + vars:

- `staging` (deploys from `dev`)
- `production` (deploys from `main`)

### GitHub Actions workflows

- `.github/workflows/deploy-relay-staging.yml` (push `dev`) → deploy `w3a-relay-staging` + configure Email Routing
- `.github/workflows/deploy-relay-prod.yml` (push `main`) → deploy `w3a-relay-prod` + configure Email Routing
- `.github/workflows/deploy-docs-staging.yml` (push `dev`) → deploy Pages `w3a-tatchi-docs-staging`
- `.github/workflows/deploy-docs-prod.yml` (push `main`) → deploy Pages `w3a-tatchi-docs-prod`
- `.github/workflows/deploy-wallet-iframe-staging.yml` (push `dev`) → deploy Pages `w3a-wallet-iframe-staging`
- `.github/workflows/deploy-wallet-iframe-prod.yml` (push `main`) → deploy Pages `w3a-wallet-iframe-prod`
- `.github/workflows/publish-sdk-r2.yml` (optional) → publish `sdk/dist` to R2 after `ci` succeeds (or via manual dispatch)

### R2 Storage
- **Path**: `sdk/dist/**` + `manifest.json` + `manifest.sig`
- **Structure**:
  - `releases/<git-sha>/...` (commit-specific)
  - `releases/<tag>/...` (tagged releases)

## One-Time Cloudflare Setup

### 1. Account Setup

1. **Create Cloudflare Account**
   - Go to [Cloudflare Sign Up](https://dash.cloudflare.com/sign-up) and create an account
   - Complete account verification

2. **Get Account ID**
   - Go to **Workers & Pages** section in Cloudflare dashboard
   - Copy your **Account ID** from the right sidebar
   - Reference: [Cloudflare Account ID Documentation](https://developers.cloudflare.com/fundamentals/get-started/basic-tasks/find-account-and-zone-ids/)

### 2. API Token Setup

Create an API Token with the following permissions:

1. **Go to**: [My Profile → API Tokens → Create Token](https://dash.cloudflare.com/profile/api-tokens)
2. **Use**: "Custom token" template
3. **Permissions**:
   - **Workers Scripts**: Edit
   - **Pages**: Edit
   - **R2**: Edit (only if you use `publish-sdk-r2.yml`)
   - **Email Routing**: Edit (only if you want the relay deploy workflow to manage Email Routing rules)
4. **Account Resources**: Include - All accounts
5. **Zone Resources**: Include - All zones
6. **Copy the token** (you'll need this for `CLOUDFLARE_API_TOKEN`)
7. **Reference**: [Cloudflare API Tokens Documentation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

### 3. R2 Storage Setup

1. **Create R2 Bucket**
   - Go to [R2 Object Storage](https://dash.cloudflare.com/r2) in Cloudflare dashboard
   - Click **Create bucket**
   - Name it (e.g., `w3a-sdk`)
   - Choose location (recommend US East for global access)
   - Reference: [R2 Getting Started Guide](https://developers.cloudflare.com/r2/get-started/)

2. **Generate S3 Access Keys**
   - Go to [Manage R2 API tokens](https://dash.cloudflare.com/r2/api-tokens)
   - Click **Create API token**
   - **Permissions**: Object Read & Write
   - **Bucket**: Your bucket name
   - **Copy the credentials**:
     - Access Key ID
     - Secret Access Key
   - Reference: [R2 API Tokens Documentation](https://developers.cloudflare.com/r2/api/s3/tokens/)

3. **Get R2 Endpoint**
   - Your endpoint will be: `https://<account_id>.r2.cloudflarestorage.com`
   - Replace `<account_id>` with your actual Account ID
   - Reference: [R2 S3 API Documentation](https://developers.cloudflare.com/r2/api/s3/api/)

## GitHub Secrets Configuration

Add these secrets to your GitHub Environments (`staging` and `production`). The workflows read secrets/vars from the environment they run in.

Go to: Repository → Settings → Environments → pick `staging` / `production`.

### Worker/Pages Secrets
```
CLOUDFLARE_API_TOKEN=<your_api_token>
CLOUDFLARE_ACCOUNT_ID=<your_account_id>
CLOUDFLARE_ZONE_ID=<your_zone_id>   # required if using Email Routing automation in relay deploy workflows
```

### R2 Storage Secrets
```
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=<your_bucket_name>
R2_ACCESS_KEY_ID=<your_access_key_id>
R2_SECRET_ACCESS_KEY=<your_secret_access_key>
```

### Optional GitHub Secrets

- `THRESHOLD_ED25519_MASTER_SECRET_B64U` (only if using threshold signing; the relay deploy workflows can push it into the Worker as a Wrangler secret)

## Cloudflare Pages Project Setup

### 1. Create Pages Projects (One-time)

You can either:
- **Auto-create**: Let the first deployment create them automatically
- **Manual create**: Create them beforehand for more control

#### Manual Creation:
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create Pages projects
wrangler pages project create w3a-tatchi-docs-staging
wrangler pages project create w3a-tatchi-docs-prod
wrangler pages project create w3a-wallet-iframe-staging
wrangler pages project create w3a-wallet-iframe-prod
```

**Reference**: [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 2. Set the Production branch (important)

Cloudflare Pages treats deployments on the “Production branch” as **Production** (custom domains attach here).

For this repo’s setup:

- For the `*-staging` Pages projects, set **Production branch** to `dev`.
- For the `*-prod` Pages projects, set **Production branch** to `main`.

This avoids “Preview” deployments for staging when you push to `dev`.

## GitHub Environment variables (build-time Vite vars)

Set these as **Environment variables** (not secrets) in `staging` / `production`:

- `VITE_WALLET_ORIGIN`
  - staging: `https://wallet-staging.web3authn.org`
  - production: `https://wallet.web3authn.org`
- `VITE_RELAYER_URL`
  - staging: `https://relay-staging.tatchi.xyz`
  - production: `https://relay.tatchi.xyz`
- `VITE_RELAYER_ACCOUNT_ID`
- `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`, `VITE_NEAR_EXPLORER`
- `VITE_WEBAUTHN_CONTRACT_ID`
- `VITE_RP_ID_BASE`
- Optional (SDK defaults): `VITE_WALLET_SERVICE_PATH` (defaults to `/wallet-service`), `VITE_SDK_BASE_PATH` (defaults to `/sdk`)
- `RECOVER_EMAIL_RECIPIENT` (required by relay deploy workflows for Email Routing)

## Worker secrets and vars (Cloudflare-side)

The relay Worker requires runtime secrets that are stored in Cloudflare (not GitHub):

- Secrets (Wrangler): `RELAYER_PRIVATE_KEY`, `SHAMIR_P_B64U`, `SHAMIR_E_S_B64U`, `SHAMIR_D_S_B64U`
- Optional secrets: `THRESHOLD_ED25519_MASTER_SECRET_B64U`
- Vars (`wrangler.toml` or `wrangler deploy --var ...`): `EXPECTED_ORIGIN`, `EXPECTED_WALLET_ORIGIN`, `WEBAUTHN_CONTRACT_ID`, `NEAR_RPC_URL`, etc.

Set secrets for each environment:

```bash
cd examples/relay-cloudflare-worker
pnpm install

wrangler login

# Production
wrangler secret put RELAYER_PRIVATE_KEY --env production
wrangler secret put SHAMIR_P_B64U --env production
wrangler secret put SHAMIR_E_S_B64U --env production
wrangler secret put SHAMIR_D_S_B64U --env production

# Staging
wrangler secret put RELAYER_PRIVATE_KEY --env staging
wrangler secret put SHAMIR_P_B64U --env staging
wrangler secret put SHAMIR_E_S_B64U --env staging
wrangler secret put SHAMIR_D_S_B64U --env staging
```

## Deploying

Once Cloudflare + GitHub Environments are set up:

- Push to `dev` to deploy **staging** (`w3a-*-staging`)
- Push to `main` to deploy **production** (`w3a-*-prod`)

You can also run any workflow manually via `workflow_dispatch`.

## Notes on R2

Cloudflare Pages is already CDN-backed. The deploy workflows copy the SDK runtime assets into the Pages output under `/sdk/*`, so staging/prod sites work without R2.

R2 publishing (`publish-sdk-r2.yml`) is still useful if you want a signed, immutable artifact store (for external distribution or future “load SDK assets from R2” setups).
