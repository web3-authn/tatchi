# Cloudflare & GitHub Actions Setup Guide

This guide walks you through setting up Cloudflare and GitHub Actions for the Web3Authn Passkey SDK deployment pipeline.

## Overview

The `deploy-cloudflare` workflow:
- Builds the SDK with deterministic bundles
- Publishes bundles to Cloudflare R2 storage
- Deploys the relay server as a Cloudflare Worker
- Deploys the `examples/vite-secure` site to Cloudflare Pages
- Deploys the wallet host example to Cloudflare Pages (wallet origin). The SDK's Vite build plugin now emits `dist/wallet-service/index.html` and `_headers` automatically when missing.

## What Gets Deployed

### Cloudflare Worker
- **Path**: `examples/relay-cloudflare-worker`
- **Method**: `wrangler deploy`
- **Purpose**: Relay server for Shamir secret sharing

### Cloudflare Pages
- **examples/tatchi-docs** → CF Pages (primary site)
- **wallet host example** (`examples/vite-secure/dist`) → CF Pages (wallet origin)

Note: `examples/vite` is for local testing only and is not deployed.

### R2 Storage
- **Path**: `passkey-sdk/dist/**` + `manifest.json` + `manifest.sig`
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
   - **R2**: Edit (for deterministic bundles)
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

Add these secrets to your GitHub repository OR to a GitHub Environment used by this workflow (recommended for prod). If you use Environment secrets, ensure the jobs that need them specify that environment (see workflow `environment:` lines).

### Go to: [Repository → Settings → Secrets and variables → Actions](https://docs.github.com/en/actions/security-guides/encrypted-secrets) or [Repository → Settings → Environments] and select your environment (e.g., `production`).

### Worker/Pages Secrets
```
CLOUDFLARE_API_TOKEN=<your_api_token>
CLOUDFLARE_ACCOUNT_ID=<your_account_id>
CF_PAGES_PROJECT_VITE=<pages_project_name_for_vite_secure>
CF_PAGES_PROJECT_WALLET=<pages_project_name_for_wallet>
```

### R2 Storage Secrets
```
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=<your_bucket_name>
R2_ACCESS_KEY_ID=<your_access_key_id>
R2_SECRET_ACCESS_KEY=<your_secret_access_key>
```

### npm Publish Secret (optional, for automated npm releases)
If you want CI to publish Tatchi packages to npm after a successful Cloudflare production deploy, add this secret:

```
NPM_TOKEN=<an npm access token with "automation" (publish) scope>
```

- Create a token at: https://www.npmjs.com/settings/<your_user>/tokens
- Use a Classic token with at least “Publish” permissions (or an Automation token for organizations).
- Store it either as a repository secret or in the `production` Environment (recommended).

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
wrangler pages project create <CF_PAGES_PROJECT_VITE>
wrangler pages project create <CF_PAGES_PROJECT_WALLET>
```

**Reference**: [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### 2. Wallet service + headers: zero‑config via Vite plugin

For Cloudflare Pages (and Netlify), the SDK’s build plugin handles both the wallet service page and headers at build time:

- Add the build plugin in your Vite config:
  - Import: `tatchiBuildHeaders` from `@tatchi-xyz/sdk/plugins/vite`
  - In `plugins`, add: `tatchiBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN })`
- Provide env vars (Pages project → Environment Variables):
  - `VITE_WALLET_ORIGIN` (e.g., `https://wallet.tatchi.xyz`)
  - Optional: `VITE_WALLET_SERVICE_PATH` (default `/wallet-service`)
  - Optional: `VITE_SDK_BASE_PATH` (default `/sdk`)

Build outputs:
- `dist/_headers` containing:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Resource-Policy: cross-origin`
  - `Permissions-Policy: publickey-credentials-get/create` delegating to your wallet origin
  - By default, the plugin does NOT emit `Access-Control-Allow-Origin` to avoid duplication with platform headers.
- If your platform does not add CORS for `/sdk/*`, you may opt in via Vite config:
    - `tatchiBuildHeaders({ walletOrigin, cors: { accessControlAllowOrigin: '*' } })`
- `dist${VITE_WALLET_SERVICE_PATH}/index.html` (minimal) if not already provided by your app under `public/`. The plugin never overwrites existing files.

With this, CI does not need to inject HTML or headers; it only needs to build the example and deploy the `dist` folder.

### 2. Update GitHub Secrets
Use the project names you created in the GitHub secrets:
```
CF_PAGES_PROJECT_VITE=tatchi-docs
CF_PAGES_PROJECT_WALLET=tatchi-wallet-iframe
```

## Worker Environment Configuration

## Automated npm publish flow (optional)

When enabled (by adding `NPM_TOKEN`), the workflow will also publish the SDK to npm after a successful production deploy.

- Job name: `Publish SDK to npm`
- Location: `.github/workflows/deploy-cloudflare.yml`
- Gate: runs only on tag pushes (refs/tags/*) and only after `deploy-worker`, `deploy-pages`, and `deploy-wallet` all succeed
- Package: `@tatchi-xyz/sdk` (subpaths `react`, `server`)

How to cut a release:
1) Bump the version in `passkey-sdk/package.json` (e.g., 0.1.1)
2) Create and push a matching tag on the same commit:

```bash
git tag v0.1.1
git push origin v0.1.1
```

3) The `deploy-cloudflare` workflow will run. After all Cloudflare deploy jobs succeed, it will build the SDK and run:

```bash
npm publish --access public
```

Safety checks:
- The job checks if the target package versions already exist on npm and skips publish if so (idempotent on re‑runs).
- Requires secret `NPM_TOKEN` with publish permissions.

### 1. Configure Worker Variables

Set the following Worker environment variables before deploying `examples/relay-cloudflare-worker`:

**Required**

- `RELAYER_ACCOUNT_ID`: NEAR account name the relay uses to send transactions.
- `RELAYER_PRIVATE_KEY`: Secret ed25519 key for the relayer account. Set via `wrangler secret put RELAYER_PRIVATE_KEY`.
- `WEBAUTHN_CONTRACT_ID`: On-chain contract handling registration/auth flows.
- `NEAR_RPC_URL`: RPC endpoint (e.g. `https://test.rpc.fastnear.com`).
- `NETWORK_ID`: NEAR network id (`testnet` or `mainnet`). Defaults to `testnet` if omitted.
- `SHAMIR_P_B64U`, `SHAMIR_E_S_B64U`, `SHAMIR_D_S_B64U`: Base64url Shamir parameters required for `/vrf/*` endpoints. Store via `wrangler secret put`.

**Optional**

- `ACCOUNT_INITIAL_BALANCE`: YoctoNEAR deposit for new accounts. Defaults to `30000000000000000000000` (0.03 NEAR).
- `CREATE_ACCOUNT_AND_REGISTER_GAS`: Gas allocation for atomic create+register. Defaults to `85000000000000` (85 Tgas).
- `EXPECTED_ORIGIN`: Wallet/host origin allowed for CORS (e.g. `https://tatchi.xyz`).
- `EXPECTED_WALLET_ORIGIN`: Wallet iframe origin allowed for CORS (e.g. `https://tatchi.xyz`).
- `ENABLE_ROTATION`: Set to `"1"` to enable the optional cron handler for Shamir rotation.

Secrets (`RELAYER_PRIVATE_KEY`, `SHAMIR_*`) must be created with Wrangler before deploying:
