# GitHub Workflows (reorg plan)

Goal: reorganize `.github/workflows/*.yml` into a small set of clear workflows with explicit **staging (`dev`)** vs **prod (`main`)** triggers.

## GitHub Environments (config strategy)

- GitHub Environments in this repo are: `staging` and `production`.
- Staging (`dev`) is intended to be a mirror of production (`main`), so keep the **same set of** `secrets.*` and `vars.*` in both environments (and mirror values where possible).
- Staging and prod are kept independent primarily via **Cloudflare resource names** (Worker name / Pages project + custom domain).
- Key env var differences:
  - `VITE_RELAYER_URL`: `https://relay-staging.tatchi.xyz` (staging) vs `https://relay.tatchi.xyz` (production)

## Cloudflare resource names (new mapping)

Use different Cloudflare resources for staging vs production so `dev` deployments cannot overwrite `main` deployments:

- Relay Worker
  - `w3a-relay-staging` (new)
  - `w3a-relay` → `w3a-relay-prod`
  - Domain routing:
    - `https://relay-staging.tatchi.xyz` → `w3a-relay-staging`
    - `https://relay.tatchi.xyz` → `w3a-relay-prod`
- Docs (Cloudflare Pages project)
  - `w3a-tatchi-docs-staging` (new)
  - `tatchi-docs` → `w3a-tatchi-docs-prod`
- Wallet iframe (Cloudflare Pages project)
  - `w3a-wallet-iframe-staging` (new) → `staging.web3authn.org`
  - `w3a-wallet-iframe-prod` (new) → `web3authn.org`

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
   - 4a. `deploy-wallet-iframe-staging.yml`: only on `dev` branch, GitHub Environment `staging` → `w3a-wallet-iframe-staging` (`staging.web3authn.org`).
   - 4b. `deploy-wallet-iframe-prod.yml`: only on `main` branch, GitHub Environment `production` → `w3a-wallet-iframe-prod` (`web3authn.org`).
5. Publish SDK artifacts to Cloudflare R2
   - `publish-sdk-r2.yml`: dedicated workflow (manual trigger + optional branch/tag triggers).

Removed: `.github/workflows/deploy-zk-email-cloudflare-worker.yml`.
Removed: `.github/workflows/deploy-separate-wallet-host.yml`.

## Current state (what exists today)

- `ci.yml`: builds/tests (but currently branch-filtered).
- `deploy-cloudflare.yml`: legacy combined pipeline (now manual-only) that deployed relay + docs + wallet + R2 publishing.
- `deploy-docs-dev.yml`: legacy `dev` docs deploy (now manual-only) that deployed docs + dev R2 publishing via `cloudflare/pages-action`.
- `deploy-separate-wallet-host.yml`: (removed) deployed `examples/vite` to separate Pages projects.
- `deploy-zk-email-cloudflare-worker.yml`: (removed) legacy manual deploy for a standalone zk-email worker + email routing.

## Plan (migration checklist)

### 1) CI: run on all branches

- Update `.github/workflows/ci.yml`:
  - `on.push`: remove `branches: [...]`
  - `on.pull_request`: remove `branches: [...]`

### 2) Split relayer worker deploy from `deploy-cloudflare.yml`

- Create `.github/workflows/deploy-relay-staging.yml`:
  - `on.push.branches: [ dev ]`
  - `environment.name: staging`
  - Deploy worker name: `w3a-relay-staging`.
  - Copy the existing relay deploy logic from the `deploy-worker` job in `deploy-cloudflare.yml`, but target the staging worker name.
- Create `.github/workflows/deploy-relay-prod.yml`:
  - `on.push.branches: [ main ]`
  - `environment.name: production`
  - Deploy worker name: `w3a-relay-prod` (rename from current `w3a-relay`).
  - Same logic as staging, but target the prod worker name.

Important: keep staging/prod independent:
- Both staging and prod configure Cloudflare Email Routing.
- Ensure `staging` vs `production` differ in at least one of:
  - `secrets.CLOUDFLARE_ZONE_ID` (staging zone vs prod zone), or
  - `vars.RECOVER_EMAIL_RECIPIENT` (staging recipient vs prod recipient),
  so that `dev` runs cannot overwrite the production routing rule.

### 3) Split docs deploy into staging + prod

- Create `.github/workflows/deploy-docs-staging.yml`:
  - `on.push.branches: [ dev ]`
  - `environment.name: staging`
  - Deploy Pages project: `w3a-tatchi-docs-staging`.
- Create `.github/workflows/deploy-docs-prod.yml`:
  - `on.push.branches: [ main ]`
  - `environment.name: production`
  - Deploy Pages project: `w3a-tatchi-docs-prod` (rename from current `tatchi-docs`).

Implementation choice (pick one and standardize):
- A) Extract the VitePress + `wrangler pages deploy` approach from `deploy-cloudflare.yml`, or
- B) Adapt the `cloudflare/pages-action@v1` approach from `deploy-docs-dev.yml`.

### 4) Decide where “publish SDK to R2” lives

Today:
- `deploy-cloudflare.yml` publishes `sdk/dist` to R2 under `releases/<sha>` (and optionally tags), with a sha256 manifest + cosign signature.
- `deploy-docs-dev.yml` publishes `sdk/dist` to R2 under `releases-dev/<sha>`.

After the split, choose one:
- Put R2 publishing in `deploy-docs-prod.yml` (and optionally `deploy-docs-staging.yml` with a `releases-dev/` prefix), or
- Create a dedicated workflow (e.g. `publish-sdk-r2.yml`) and have docs deployments consume the same artifact layout.

Decision:
- Use a dedicated workflow: `.github/workflows/publish-sdk-r2.yml`.

### 5) Split wallet iframe deploy into staging + prod

- Create `.github/workflows/deploy-wallet-iframe-staging.yml`:
  - `on.push.branches: [ dev ]`
  - `environment.name: staging`
  - Deploy Pages project: `w3a-wallet-iframe-staging` (custom domain: `staging.web3authn.org`).
  - Extract the wallet build/deploy logic from the `deploy-wallet` job in `deploy-cloudflare.yml`, but target the staging Pages project.
- Create `.github/workflows/deploy-wallet-iframe-prod.yml`:
  - `on.push.branches: [ main ]`
  - `environment.name: production`
  - Deploy Pages project: `w3a-wallet-iframe-prod` (custom domain: `web3authn.org`).
  - Same logic as staging, but target the prod Pages project.

### 6) Cleanup old workflows

- Remove `.github/workflows/deploy-zk-email-cloudflare-worker.yml`.
- Remove `.github/workflows/deploy-separate-wallet-host.yml`.
- Once the new workflows are green in Actions:
  - Delete or archive `.github/workflows/deploy-cloudflare.yml`.
  - Delete or rename `.github/workflows/deploy-docs-dev.yml` (replaced by `deploy-docs-staging.yml`).

## Validation checklist

- GitHub Environments `staging` and `production` contain all required `secrets.*` and `vars.*` referenced by their workflows.
- Staging deploys (`dev`) do not overwrite production resources (Pages + Worker).
- Relay email routing (if configured) points to the intended worker.
- Wallet iframe Pages projects serve the correct domains:
  - staging: `staging.web3authn.org`
  - prod: `web3authn.org`

## Phased TODO (recommended sequence)

### Phase 0 — Decisions and prerequisites

- [x] Use GitHub Environments `staging` and `production`.
- [x] Publish SDK to R2 via a dedicated workflow (`publish-sdk-r2.yml`).
- [x] Configure Cloudflare Email Routing in staging as well (to test end-to-end).
- [ ] Ensure staging/prod email routing is independent by configuring different `CLOUDFLARE_ZONE_ID` and/or `RECOVER_EMAIL_RECIPIENT` in `staging` vs `production`.

### Phase 1 — Cloudflare resource setup (no GitHub changes yet)

- [ ] Create/rename Cloudflare resources:
  - Relay Workers: `w3a-relay-staging` (new), `w3a-relay` → `w3a-relay-prod`
  - Pages projects: `w3a-tatchi-docs-staging` (new), `tatchi-docs` → `w3a-tatchi-docs-prod`
  - Pages projects: `w3a-wallet-iframe-staging` (new), `w3a-wallet-iframe-prod` (new)
- [ ] Set Pages custom domains:
  - `staging.web3authn.org` → `w3a-wallet-iframe-staging`
  - `web3authn.org` → `w3a-wallet-iframe-prod`
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

- [ ] Run a `dev` push and confirm:
  - Relay uses `w3a-relay-staging`
  - Docs deploys to `w3a-tatchi-docs-staging`
  - Wallet iframe deploys to `staging.web3authn.org`
- [ ] Run a `main` push and confirm:
  - Relay uses `w3a-relay-prod`
  - Docs deploys to `w3a-tatchi-docs-prod`
  - Wallet iframe deploys to `web3authn.org`
- [ ] Confirm no staging deploy overwrites prod (Workers/Pages are independent).

### Phase 4 — Cleanup and documentation

- [x] Delete legacy workflows: `deploy-zk-email-cloudflare-worker.yml`, `deploy-separate-wallet-host.yml`.
- [ ] Delete old workflows after validation: `deploy-cloudflare.yml`, `deploy-docs-dev.yml`.
- [x] Update `docs/deployment/deployment-overview.md` to reflect only `staging`/`production` GitHub Environments and the new workflow split.
