# Web4 Hosting — On‑chain Wallet UI / SDK

Goal: host a canonical, on‑chain copy of the wallet UI and SDK bundles, plus a manifest of content hashes, so that any deployment (Cloudflare Pages, R2, other CDNs) can be verified against the on‑chain reference. This is conceptually similar to Subresource Integrity (SRI): the content is addressed by its hash, and we reject bundles that don’t match.

Non‑goals:
- Replacing the primary `web3authn.org` / `wallet.web3authn.org` hosting path for normal users.
- Changing WebAuthn `rpId` or moving `/.well-known/webauthn` to web4.
- Making `rpId = web3authn.org` fully censorship‑proof; DNS and the Web PKI remain the root of trust for passkeys.

## References

- Web4 gateway and contract format: https://github.com/vgrichina/web4
- Rust starter project: https://github.com/frol/near-web4-demo
- Release and deploy docs:
  - `docs/deployment/deployment-overview.md`
  - `docs/deployment/release.md`

## High‑Level Design

- Introduce a dedicated NEAR account (e.g. `web4authn.near`) that runs a web4 contract.
- Use `web4-deploy` to:
  - Upload wallet UI and SDK bundles (built artifacts) to NEARFS / IPFS.
  - Update the web4 contract so it serves:
    - `GET /` and `/wallet/*` → wallet UI from NEARFS.
    - `/sdk/*` → SDK bundles (optional, can be a subset or just a manifest).
    - `/manifest.json` → JSON manifest of all shipped bundles with `sha256` hashes.
- Bind the web4 contract to one or more domains via web4 custom domain support (e.g. an alternate origin such as `web3authn.near.page`).
- CI publishes each tagged release to:
  - Cloudflare R2 (current path, used by the main wallet host).
  - Web4 (on‑chain copy + manifest) as the canonical reference for what the release should contain.

## Stage 1 — Contract and Account

- Create or reuse a NEAR account dedicated to web4 hosting, e.g. `web4authn.near`.
- Bootstrap a web4 contract (Rust or AssemblyScript):
  - Start from `near-web4-demo` or a similar template.
  - Implement `web4_get(request)` to:
    - Route `/` and `/wallet/*` to NEARFS content that `web4-deploy` uploads.
    - Optionally route `/sdk/*` to SDK bundles, or simply serve a manifest that points to them.
    - Route `/manifest.json` to JSON stored in contract state, derived from the release manifest (see Stage 2).
- Access control:
  - Only a CI deploy key (stored in GitHub secrets) can update the contract and NEARFS pointers.
  - Human operator keys are hardware‑backed and used only for recovery.

## Stage 2 — Build Artifacts and Hashing

- Wallet UI build:
  - Source: `examples/vite` wallet project.
  - Output: `examples/vite/dist` (same dist used for Cloudflare Pages).
- SDK build:
  - Source: `sdk` workspace build.
  - Output: `sdk/dist` (or a trimmed subset of browser‑consumed bundles).
- For each release build, compute hashes and a manifest:
  - Generate `wallet-manifest.json` alongside the dist outputs with entries like:
    - Top‑level metadata: `release`, `git_sha`, `timestamp`, `near_account`.
    - `bundles: [{ path, sha256, bytes, type }]` covering JS/CSS/worker assets.
  - Optionally precompute SRI strings:
    - `integrity: "sha256-<base64>"` for each script/style so the wallet host can use `<script integrity="…">`.
- Keep hashing stable:
  - Normalize paths with a fixed prefix (e.g. `/sdk/...` or `/wallet/...`).
  - Use a single hash algorithm (e.g. `sha256`) everywhere (R2 manifest, web4 manifest, SRI).

## Stage 3 — CI Integration with Web4

- Add a GitHub Actions job (e.g. `deploy-web4-wallet`) that runs after the wallet/SDK build for tags and/or `main`:
  - Inputs:
    - `examples/vite/dist`
    - `sdk/dist` (if mirrored)
    - `wallet-manifest.json`
  - Steps:
    - Install `web4-deploy` (`npx web4-deploy`).
    - Upload static assets to NEARFS:
      - `npx web4-deploy ./examples/vite/dist --accountId web4authn.near --nearfs`
      - Optionally a separate call for SDK bundles if stored under a different prefix.
    - Update the web4 contract state with:
      - `manifest.json` contents from `wallet-manifest.json`.
      - Pointers to the NEARFS/IPFS content for `/wallet/*` and `/sdk/*`.
  - Secrets:
    - NEAR key for `web4authn.near`.
    - Optional `FAST_NEAR_URL` for faster RPC calls.
  - Artifacts:
    - Publish `wallet-manifest.json` as a CI artifact so other jobs (R2 deploy, docs deploy) can consume the exact hashes.

## Stage 4 — Cross‑Checking R2 vs Web4 (Verification)

- In the R2 publishing job (see `deploy-cloudflare.yml`):
  - Consume the CI artifact `wallet-manifest.json`.
  - Compute `sha256` hashes for the files being uploaded to R2 and compare with the manifest before marking the job successful.
  - Optionally, fetch `/manifest.json` from the web4 gateway (`https://web4authn.near.page/manifest.json`) and assert it matches the CI artifact.
- If any hash mismatch is detected:
  - Fail the deployment and alert (this is effectively an SRI‑style mismatch at deploy time).
  - Provide a manual override path (see Stage 6 runbook) with explicit review/approval.

## Stage 5 — Optional Web4 Wallet Origin

- Decide whether to expose a public web4‑hosted wallet origin for advanced users:
  - Bind a custom domain (e.g. `wallet-alt.web3authn.org`) or rely on `https://web4authn.near.page`.
  - Serve the same `index.html` + bundles as the primary wallet host, but via web4.
- rpId posture:
  - Keep primary rpId as `web3authn.org`; do not move passkey flows to an alternate rpId.
  - Treat the web4 origin as:
    - A censorship‑resistant access path for the wallet UI.
    - A verifiable reference implementation: its assets must match the on‑chain manifest and R2 contents.
- Documentation:
  - Add a short section to the public docs (e.g. in `examples/tatchi-docs`) explaining:
    - Where to find `/manifest.json` on web4.
    - How to audit a running wallet host or SDK CDN against that manifest.

## Stage 6 — Monitoring and Runbooks

- Monitoring:
  - Add a lightweight check (script or external monitor) that:
    - Fetches `/manifest.json` from web4 and parses it.
    - Fetches selected bundles from the primary wallet host / R2 and recomputes hashes.
    - Alerts on:
      - Manifest unavailability (web4 down).
      - Hash mismatches between web4 manifest and R2 content.
- Runbooks:
  - “Rollback a bad web4 deploy”:
    - Redeploy previous `wallet-manifest.json` and NEARFS pointers to the web4 contract.
  - “Recover from compromised wallet host”:
    - Compare current wallet host assets with web4 manifest.
    - If mismatched, redeploy from a clean build whose hashes match the on‑chain manifest.
  - “Rotate NEAR keys for `web4authn.near`”:
    - Steps to generate new keys, update CI secrets, and verify web4 deployments still succeed.

## Implementation Checklist

### 1. Prerequisites (Manual Setup)
- [ ] **Create a NEAR Account**: You need a dedicated account (e.g., `web4authn.near`) to deploy the contract to.
- [ ] **Get Deploy Key**: You'll need a Full Access Key for this account to use in CI (stored as `NEAR_WEB4_KEY` in GitHub Secrets).

### 2. Stage 1: Web4 Contract
You need a minimal Web4 contract to route requests to the uploaded content.
- [ ] **Create Contract**: Create a new Rust project (e.g., `web4-contract`) that implements `web4_get`.
- [ ] **Deploy Initial Contract**: Build and deploy this contract to your NEAR account once.

### 3. Stage 2: Manifest Generation
Your current CI generates a manifest for the SDK, but the Web4 plan requires a comprehensive `wallet-manifest.json`.
- [ ] **Create Manifest Script**: Write a script (e.g., `scripts/generate-web4-manifest.ts`) that:
    - Scans `examples/vite/dist` (Wallet UI).
    - Scans `sdk/dist` (SDK).
    - Generates the JSON manifest with hashes.

### 4. Stage 3: CI Automation
- [ ] **Create Workflow**: Create `.github/workflows/deploy-web4.yml` that:
    - Builds the Wallet and SDK (reusing your existing build steps).
    - Runs the manifest script.
    - Uses `npx web4-deploy` to upload assets to NEARFS and update the contract.

### 5. Verification
- [ ] **Verify**: Check `https://<your-account>.page` (e.g., `web4authn.near.page`) to see if the wallet loads.


