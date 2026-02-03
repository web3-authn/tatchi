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
