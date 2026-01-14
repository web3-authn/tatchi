# GitHub Workflows (reorg plan)

Goal: reorganize `.github/workflows/*.yml` into a small set of clear workflows with explicit **staging (`dev`)** vs **prod (`main`)** triggers.

## GitHub Environments (config strategy)

- GitHub Environments in this repo are: `staging` and `production`.
- Staging (`dev`) is intended to be a mirror of production (`main`), so keep the **same set of** `secrets.*` and `vars.*` in both environments (and mirror values where possible).
- Staging and prod are kept independent primarily via **Cloudflare resource names** (Worker name / Pages project + custom domain).
- Key env var differences:
  - `VITE_RELAYER_URL`: `https://relay-staging.tatchi.xyz` (staging) vs `https://relay.tatchi.xyz` (production)

## Cloudflare resource names (mapping)

Use different Cloudflare resources for staging vs production so `dev` deployments cannot overwrite `main` deployments:

- Relay Worker
  - `w3a-relay-staging`
  - `w3a-relay-prod`
  - Domain routing:
    - `https://relay-staging.tatchi.xyz` → `w3a-relay-staging`
    - `https://relay.tatchi.xyz` → `w3a-relay-prod`
- Docs (Cloudflare Pages project)
  - `w3a-tatchi-docs-staging`
  - `w3a-tatchi-docs-prod`
- Wallet iframe (Cloudflare Pages project)
  - `w3a-wallet-iframe-staging` → `wallet-staging.web3authn.org`
  - `w3a-wallet-iframe-prod` → `wallet.web3authn.org`

## Target workflow files

1. `ci.yml`
   - Runs on **all branches**.
2. Deploy relayer worker to Cloudflare
   - 2a. `deploy-relay-staging.yml`: only on `dev` branch, GitHub Environment `staging`.
   - 2b. `deploy-relay-prod.yml`: only on `main` branch, GitHub Environment `production`.
3. Deploy `examples/tatchi-docs` to Cloudflare Pages
   - 3a. `deploy-docs-staging.yml`: only on `dev` branch, GitHub Environment `staging`.
   - 3b. `deploy-docs-prod.yml`: only on `main` branch, GitHub Environment `production`.
4. Deploy wallet iframe (`examples/vite`) to Cloudflare Pages
   - 4a. `deploy-wallet-iframe-staging.yml`: only on `dev` branch, GitHub Environment `staging` → `w3a-wallet-iframe-staging` (`wallet-staging.web3authn.org`).
   - 4b. `deploy-wallet-iframe-prod.yml`: only on `main` branch, GitHub Environment `production` → `w3a-wallet-iframe-prod` (`wallet.web3authn.org`).
5. Publish SDK artifacts to Cloudflare R2
   - `publish-sdk-r2.yml`: dedicated workflow (manual trigger + `ci` workflow_run trigger).

Removed: `.github/workflows/deploy-zk-email-cloudflare-worker.yml`.
Removed: `.github/workflows/deploy-separate-wallet-host.yml`.
Removed: `.github/workflows/deploy-cloudflare.yml`.
Removed: `.github/workflows/deploy-docs-dev.yml`.

## Current state (what exists today)

- `ci.yml`: builds/tests on push/PR.
- `deploy-relay-staging.yml`, `deploy-relay-prod.yml`: relay Worker deploys + Email Routing.
- `deploy-docs-staging.yml`, `deploy-docs-prod.yml`: VitePress docs deploys.
- `deploy-wallet-iframe-staging.yml`, `deploy-wallet-iframe-prod.yml`: wallet iframe deploys.
- `publish-sdk-r2.yml`: optional signed bundle publishing to R2.

## Phased TODO (recommended sequence)

### Phase 0 — Decisions and prerequisites

- [x] Use GitHub Environments `staging` and `production`.
- [x] Publish SDK to R2 via a dedicated workflow (`publish-sdk-r2.yml`).
- [x] Configure Cloudflare Email Routing in staging as well (to test end-to-end).
- [ ] Ensure staging/prod email routing is independent by configuring different `CLOUDFLARE_ZONE_ID` and/or `RECOVER_EMAIL_RECIPIENT` in `staging` vs `production`.

### Phase 1 — Cloudflare resource setup (no GitHub changes yet)

- [ ] Create/rename Cloudflare resources:
  - Relay Workers: `w3a-relay-staging`, `w3a-relay-prod`
  - Pages projects: `w3a-tatchi-docs-staging`, `w3a-tatchi-docs-prod`
  - Pages projects: `w3a-wallet-iframe-staging`, `w3a-wallet-iframe-prod`
- [ ] Set Pages custom domains:
  - `wallet-staging.web3authn.org` → `w3a-wallet-iframe-staging`
  - `wallet.web3authn.org` → `w3a-wallet-iframe-prod`
- [ ] Verify each new Pages project deploys manually (upload any placeholder) and the domain resolves.

### Phase 2 — Add new workflows (keep old ones for safety)

- [x] Update `.github/workflows/ci.yml` to run on all branches.
- [x] Add relay workflows:
  - `.github/workflows/deploy-relay-staging.yml` (push `dev` → deploy `w3a-relay-staging`)
  - `.github/workflows/deploy-relay-prod.yml` (push `main` → deploy `w3a-relay-prod`)
- [x] Add docs workflows:
  - `.github/workflows/deploy-docs-staging.yml` (push `dev` → deploy `w3a-tatchi-docs-staging`)
  - `.github/workflows/deploy-docs-prod.yml` (push `main` → deploy `w3a-tatchi-docs-prod`)
- [x] Add wallet iframe workflows:
  - `.github/workflows/deploy-wallet-iframe-staging.yml` (push `dev` → deploy `w3a-wallet-iframe-staging`)
  - `.github/workflows/deploy-wallet-iframe-prod.yml` (push `main` → deploy `w3a-wallet-iframe-prod`)
- [x] Add `.github/workflows/publish-sdk-r2.yml` (publish `sdk/dist` to R2).
- [ ] Ensure staging workflows cannot affect prod resources (Workers/Pages are separate; Email Routing is configured independently between `staging` and `production`).

### Phase 3 — Cut over traffic and validate

- [x] Run a `dev` push and confirm:
  - Relay uses `w3a-relay-staging`
  - Docs deploys to `w3a-tatchi-docs-staging`
  - Wallet iframe deploys to `wallet-staging.web3authn.org`
- [x] Run a `main` push and confirm:
  - Relay uses `w3a-relay-prod`
  - Docs deploys to `w3a-tatchi-docs-prod`
  - Wallet iframe deploys to `wallet.web3authn.org`
- [x] Confirm no staging deploy overwrites prod (Workers/Pages are independent).

### Phase 4 — Cleanup and documentation

- [x] Delete legacy workflows: `deploy-zk-email-cloudflare-worker.yml`, `deploy-separate-wallet-host.yml`.
- [x] Delete old workflows after validation: `deploy-cloudflare.yml`, `deploy-docs-dev.yml`.
- [x] Update `docs/deployment/deployment-overview.md` to reflect only `staging`/`production` GitHub Environments and the new workflow split.

