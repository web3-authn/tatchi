# Cloudflare & GitHub Actions Setup Guide

This guide walks you through setting up Cloudflare and GitHub Actions for the Web3Authn Passkey SDK deployment pipeline.

## Overview

The `deploy-cloudflare` workflow:
- Builds the SDK with deterministic bundles
- Publishes bundles to Cloudflare R2 storage
- Deploys the relay server as a Cloudflare Worker
- Deploys the `examples/vite-secure` site to Cloudflare Pages
- Deploys a minimal wallet-only static site (wallet service + SDK) to Cloudflare Pages

## What Gets Deployed

### Cloudflare Worker
- **Path**: `examples/relay-cloudflare-worker`
- **Method**: `wrangler deploy`
- **Purpose**: Relay server for Shamir secret sharing

### Cloudflare Pages
- **examples/vite-secure** → CF Pages (primary site)
- **wallet-only static** (generated in CI as `wallet-dist`) → CF Pages (wallet origin)

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
If you want CI to publish `@web3authn/passkey` to npm after a successful Cloudflare production deploy, add this secret:

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

### 2. Headers: Zero‑Config via Vite plugin

For Cloudflare Pages (and Netlify), the SDK can emit a `_headers` file at build time so you don’t have to hand‑craft COOP/COEP and Permissions‑Policy headers.

- Ensure your Vite app includes the build plugin:

  - File: examples/vite-secure/vite.config.ts:1
  - Import: `web3authnBuildHeaders` from `@web3authn/passkey/vite`
  - In `plugins`, add `web3authnBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN })`

- Provide `VITE_WALLET_ORIGIN` (e.g., `https://wallet.tatchi.xyz`) in your Pages project Environment Variables.

What it writes to `dist/_headers`:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Permissions-Policy: publickey-credentials-get/create` delegating to your wallet origin

The plugin is a no‑op if a `_headers` file already exists (it won’t override your app’s headers).

Note: The deploy-cloudflare workflow also contains a step named “Add security headers for vite-secure (COOP/COEP + WebAuthn Permissions-Policy)”. If you keep that step, it will overwrite the file written by the plugin with equivalent content. You can remove the CI step if you prefer to rely solely on the plugin.

### 2. Update GitHub Secrets
Use the project names you created in the GitHub secrets:
```
CF_PAGES_PROJECT_VITE=tatchi-vite-secure
CF_PAGES_PROJECT_WALLET=tatchi-wallet-iframe
```

## Worker Environment Configuration

## Automated npm publish flow (optional)

When enabled (by adding `NPM_TOKEN`), the workflow will also publish the SDK to npm after a successful production deploy.

- Job name: `Publish SDK to npm`
- Location: `.github/workflows/deploy-cloudflare.yml`
- Gate: runs only on tag pushes (refs/tags/*) and only after `deploy-worker`, `deploy-pages`, and `deploy-wallet` all succeed
- Package: `@web3authn/passkey` (from `passkey-sdk/package.json`)

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
- The job checks if `@web3authn/passkey@<version>` already exists on npm and skips publish if so (idempotent on re‑runs).
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
- `EXPECTED_WALLET_ORIGIN`: Wallet iframe origin allowed for CORS (e.g. `https://wallet.tatchi.xyz`).
- `ENABLE_ROTATION`: Set to `"1"` to enable the optional cron handler for Shamir rotation.

Secrets (`RELAYER_PRIVATE_KEY`, `SHAMIR_*`) must be created with Wrangler before deploying:

```bash
wrangler secret put RELAYER_PRIVATE_KEY
wrangler secret put SHAMIR_P_B64U
wrangler secret put SHAMIR_E_S_B64U
wrangler secret put SHAMIR_D_S_B64U
```

You can place non-secret values (`RELAYER_ACCOUNT_ID`, `NEAR_RPC_URL`, etc.) in the `[vars]` section of `wrangler.toml` or set them as additional secrets if you prefer.

Edit `examples/relay-cloudflare-worker/wrangler.toml` (Worker does not need RELAYER_URL — the Worker is the relayer):

```toml
[vars]
# Non-sensitive defaults
# Network: "testnet" | "mainnet" — can also be set as NETWORK_ID
NEAR_NETWORK = "testnet"
WEB_AUTHN_CONTRACT_ID = "web3-authn-v5.testnet"  # update to mainnet if switching networks
NEAR_RPC_URL = "https://test.rpc.fastnear.com"   # update RPC if switching networks
# Optional CORS for your frontends
EXPECTED_ORIGIN = "https://tachi.xyz"
EXPECTED_WALLET_ORIGIN = "https://wallet.tachi.xyz"
```

### 2. Set Worker Secrets

Run these commands locally or in CI:

```bash
# Navigate to worker directory
cd examples/relay-cloudflare-worker

# Set secrets (you'll be prompted for values)
wrangler secret put RELAYER_PRIVATE_KEY
wrangler secret put SHAMIR_P_B64U
wrangler secret put SHAMIR_E_S_B64U
wrangler secret put SHAMIR_D_S_B64U
## (Optional) you can also set NETWORK_ID if you prefer that name over NEAR_NETWORK
# wrangler secret put NETWORK_ID  # e.g. "mainnet"
```

**Reference**: [Wrangler Secrets Documentation](https://developers.cloudflare.com/workers/wrangler/commands/#secret)

**Note**: Keep cron disabled unless you need persistent rotated keys.

### 3. Frontend Relayer URL (Pages env)

Set the relayer URL in your Pages projects so the apps can reach the Worker. Prefer a custom Worker domain (e.g., `https://relay.tachi.xyz`). The SDK reads any of these keys: `VITE_RELAYER_URL`, `NEXT_PUBLIC_RELAYER_URL`, `REACT_APP_RELAYER_URL`, or `RELAYER_URL`.

- For the vite app (tachi.xyz):
  - `VITE_RELAYER_URL = https://relay.tachi.xyz`
  - `VITE_RELAYER_ACCOUNT_ID = <your-relayer.near-account>`
  - `VITE_RP_ID_BASE = example.tachi.xyz` (optional)

- For the wallet app (wallet.tachi.xyz):
  - `VITE_RELAYER_URL = https://relay.tachi.xyz`
  - `VITE_RELAYER_ACCOUNT_ID = <your-relayer.near-account>`

The config presets validate both `RELAYER_URL` and `RELAYER_ACCOUNT_ID` (see `passkey-sdk/src/core/defaultConfigs.ts`).

### Network Switch Guidance

When changing to mainnet, set the following consistently:
- Worker env: `NEAR_NETWORK=mainnet` (or `NETWORK_ID=mainnet`), update `WEB_AUTHN_CONTRACT_ID` to `web3-authn.near`, and choose a mainnet RPC (e.g., `https://rpc.mainnet.near.org`).
- Frontends (Pages): set `VITE_NEAR_NETWORK=mainnet` and align contract/relayer envs for mainnet.

## Workflow File Location

The deployment workflow is located at:
```
.github/workflows/deploy-cloudflare.yml
```

### Workflow Triggers
- **Automatic**: Push to `main` branch
- **Manual**: "Run workflow" button in GitHub Actions

### Workflow Jobs
1. **build-sdk**: Builds the SDK (Node + pnpm + Rust + wasm-pack + Bun)
2. **publish-sdk-r2**: Hashes, signs, and syncs to R2
3. **deploy-worker**: Deploys the relay server
4. **deploy-pages**: Builds and deploys `examples/vite-secure`
5. **deploy-wallet**: Generates `wallet-dist` (wallet-service + SDK assets + _headers) and deploys to the wallet Pages project

### Using GitHub Environments

This workflow supports GitHub Environments. When you trigger it manually, you can choose the environment via the `environment` input (defaults to `production`). For push events, it defaults to `production`.

- Jobs that require secrets declare:
  - `environment: name: ${{ github.event_name == 'workflow_dispatch' && inputs.environment || 'production' }}`
- Ensure your Environment (e.g., `production`) contains these secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_PAGES_PROJECT_VITE`, `CF_PAGES_PROJECT_WALLET`.

## Local Testing (Optional)

### Test Worker Locally
```bash
# Build SDK first
pnpm --filter @web3authn/passkey build

# Preview worker
pnpm -C examples/relay-cloudflare-worker dev

# Deploy worker
pnpm -C examples/relay-cloudflare-worker deploy
```

### Test Pages Locally
```bash
# Build example
pnpm -C examples/vite-secure build

# Deploy to Pages
wrangler pages deploy examples/vite-secure/dist --project-name <CF_PAGES_PROJECT_VITE>

# Generate and deploy wallet-only site (wallet-dist)
pnpm --filter @web3authn/passkey build
mkdir -p wallet-dist/wallet-service wallet-dist/sdk
cat > wallet-dist/wallet-service/index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <script>window.global ||= window; window.process ||= { env: {} };</script>
  </head>
  <body>
    <script type="module" src="/sdk/esm/react/embedded/wallet-iframe-host.js"></script>
  </body>
</html>
HTML
cat > wallet-dist/_headers <<'HEADERS'
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
  Permissions-Policy: publickey-credentials-get=(self), publickey-credentials-create=(self)

/wallet-service
  Cross-Origin-Opener-Policy: unsafe-none
/wallet-service/
  Cross-Origin-Opener-Policy: unsafe-none
HEADERS
cp -R passkey-sdk/dist/esm wallet-dist/sdk/
cp -R passkey-sdk/dist/workers wallet-dist/sdk/
wrangler pages deploy wallet-dist --project-name <CF_PAGES_PROJECT_WALLET>
```

## Verification Checklist

### Before First Deployment
- [ ] All GitHub secrets are set correctly
- [ ] R2 bucket exists and credentials work
- [ ] Cloudflare API token has correct permissions
- [ ] Worker secrets are configured (if using secrets)

### After First Deployment
- [ ] Check GitHub Actions: All jobs succeed
- [ ] **publish-sdk-r2**: Assets uploaded to R2
- [ ] **deploy-worker**: Worker URL shown by Wrangler
- [ ] **deploy-pages**: vite-secure Pages.dev URL shown
- [ ] **deploy-wallet**: wallet Pages.dev URL shown

### Verify Deployments
1. **R2 Storage**: Check `releases/<git-sha>/` in your R2 bucket
2. **Worker**: Visit the worker URL to test functionality
3. **Pages**: Visit the pages.dev URLs to test both sites

## Troubleshooting

### Common Issues

1. **"Account ID not found"**
   - Verify `CLOUDFLARE_ACCOUNT_ID` secret is correct
   - Check the Account ID in Workers & Pages dashboard

2. **"API token insufficient permissions"**
   - Regenerate API token with correct permissions
   - Ensure token includes Workers Scripts: Edit, Pages: Edit, R2: Edit

3. **"R2 bucket not found"**
   - Verify bucket name in `R2_BUCKET` secret
   - Check R2 endpoint URL format

4. **"Pages project not found"**
   - Create Pages projects manually or let first deployment auto-create them
   - Verify project names in GitHub secrets

5. **Wallet iframe blocked by COEP (message: “blocked: CORP not \"same-origin\" after defaulted to \"same-origin\" by COEP”)**
   - Symptom: The parent console shows `Failed to execute 'postMessage'… origin ('null')`, `Wallet iframe READY timeout`, and DevTools reports the service iframe request as blocked by CORP.
   - Cause: The response delivered to the browser for `/wallet-service/` did not actually include `Cross-Origin-Resource-Policy: cross-origin` (Cloudflare may have served a cached copy or a redirect without the header).
   - Fix:
     1. Ensure your `_headers` (or Pages “Custom Headers”/Transform Rule) sets `Cross-Origin-Resource-Policy: cross-origin` on `/*` so both `/wallet-service` and `/wallet-service/` inherit it.
     2. Deploy the wallet site and purge the Pages cache so the updated header reaches edge nodes.
     3. In DevTools, disable cache and reload the app; confirm the *final* `/wallet-service/` response includes a single `Cross-Origin-Resource-Policy: cross-origin` header.
     4. Once the header is present, the iframe will load normally and the handshake succeeds.

   > Note: Having duplicate identical CORP headers is harmless; the root cause is the header missing on the live response, not the duplication itself.

6. **Console shows `[PasskeyManager] No iframeWallet.walletOrigin configured…` inside the wallet host**
   - Symptom: After the wallet iframe boots, the wallet console logs `No iframeWallet.walletOrigin configured. The wallet iframe will share the host origin…`.
   - Explanation: The wallet bundle intentionally clears `iframeWallet.walletOrigin` when it runs on its own origin (e.g., `https://wallet.example.com`). This prevents it from treating itself as an embedded client. As long as the iframe is actually served from the dedicated wallet origin, this message is expected and safe to ignore.
   - Action: None required unless you intentionally run the wallet on the same origin as the parent app.

### Debug Commands
```bash
# Test Wrangler connection
wrangler whoami

# List R2 buckets
wrangler r2 bucket list

# List Pages projects
wrangler pages project list
```

**Reference**: [Wrangler Commands Documentation](https://developers.cloudflare.com/workers/wrangler/commands/)

## Optional Enhancements

### R2 "Latest" Alias
If you want a `releases/latest/` alias for the most recent build:
- Add a job to create symlinks in R2
- Update example sites to reference `latest/` paths

### Custom Domains
You can serve the example apps on your own domains. For example:

- App (vite): `https://tatchi.xyz`
- Wallet (vite-secure): `https://wallet.tatchi.xyz`

Steps:

1) Move your DNS to Cloudflare (or delegate only the subdomains you need) so Pages can manage certificates.

2) Map Pages projects to custom domains (Dashboard → Pages → Project → Custom domains):

- For your vite-secure project (`CF_PAGES_PROJECT_VITE`): add `tatchi.xyz` (or `www.tatchi.xyz` if you prefer a www domain). Cloudflare will configure an A/AAAA or CNAME record and issue certificates automatically.
- For the dedicated wallet origin (`CF_PAGES_PROJECT_WALLET`): add `wallet.tatchi.xyz`.

3) Configure environment variables in Pages (Dashboard → Pages → Project → Settings → Environment variables):

- Vite (tatchi.xyz)
  - `VITE_WALLET_ORIGIN = https://wallet.tatchi.xyz`
  - `VITE_WALLET_SERVICE_PATH = /wallet-service` (if your integration expects a specific wallet service path)

- Vite-secure (wallet.tatchi.xyz)
  - `VITE_WALLET_ORIGIN = https://wallet.tatchi.xyz` (self)
  - `VITE_WALLET_SERVICE_PATH = /wallet-service` (path served by the wallet app for the wallet service)

4) (Optional) Give your Worker (relay server) a custom domain (e.g., `relay.tatchi.xyz`). In Workers → your Worker → Triggers, add a custom domain and/or route. Then set strict CORS so only your sites can call it:

- In `examples/relay-cloudflare-worker/wrangler.toml` or via Wrangler secrets/vars:
  - `EXPECTED_ORIGIN = https://tatchi.xyz`
  - `EXPECTED_WALLET_ORIGIN = https://wallet.tatchi.xyz`

The Cloudflare adaptor will reflect these values in CORS headers. If you use a Worker custom domain (e.g., `relay.tatchi.xyz`), update any client configuration that calls the relay server.

5) In GitHub secrets, ensure you have set the Pages project names that correspond to these projects:

```
CF_PAGES_PROJECT_VITE=tatchi-vite-secure
CF_PAGES_PROJECT_WALLET=tatchi-wallet-iframe
```

With this setup, the deploy-cloudflare workflow publishes:

- App to `https://tatchi.xyz`
- Wallet to `https://wallet.tatchi.xyz`
- Deterministic SDK bundles + signed manifest to R2
- Relay server to Workers (optionally reachable via `relay.tatchi.xyz`)

## Security Notes

- **API Tokens**: Use least-privilege principle
- **R2 Access**: Limit to specific bucket
- **Worker Secrets**: Store sensitive values as secrets, not vars
- **GitHub Secrets**: Never commit secrets to repository

## Support

If you encounter issues:
1. Check GitHub Actions logs for specific error messages
2. Verify all secrets are set correctly
3. Test individual components locally
4. Review Cloudflare dashboard for deployment status

### Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
