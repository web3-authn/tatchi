# Production Deployment Plan (Mainnet)

This is the checklist/runbook for deploying a **NEAR mainnet** version of the relay + wallet iframe + docs using:

- GitHub branch: `mainnet`
- GitHub Environment: `mainnet`
- Workflows:
  - `.github/workflows/deploy-relay-mainnet.yml`
  - `.github/workflows/deploy-wallet-iframe-mainnet.yml`
  - `.github/workflows/deploy-docs-mainnet.yml`

## Target config (GitHub Environment `mainnet` → Variables)

Set these as **Environment Variables** (GitHub → Settings → Environments → `mainnet` → Variables):

```bash
RECOVER_EMAIL_RECIPIENT=recover@web3authn.org
VITE_RELAYER_URL=https://relay-mainnet.tatchi.xyz
VITE_RELAYER_ACCOUNT_ID=w3a-relayer.near
VITE_NEAR_NETWORK=mainnet
VITE_NEAR_RPC_URL=https://rpc.fastnear.com
VITE_NEAR_EXPLORER=https://nearblocks.io
VITE_WALLET_ORIGIN=https://wallet-mainnet.web3authn.org
VITE_RP_ID_BASE=web3authn.org
VITE_WEBAUTHN_CONTRACT_ID=w3a-v1.near
```

Optional (if you want to override SDK defaults used by the Vite build plugin):

- `VITE_WALLET_SERVICE_PATH` (defaults to `/wallet-service`)
- `VITE_SDK_BASE_PATH` (defaults to `/sdk`)

## Mainnet contract IDs / accounts

- WebAuthn contract: `w3a-v1.near` (`VITE_WEBAUTHN_CONTRACT_ID`)
  - https://nearblocks.io/address/w3a-v1.near
- Email DKIM verifier: `email-dkim-verifier-v1.near`
  - https://nearblocks.io/address/email-dkim-verifier-v1.near
- Email recoverer: `email-recoverer-v1.near`
  - https://nearblocks.io/address/email-recoverer-v1.near
- Relayer account: `w3a-relayer.near` (`VITE_RELAYER_ACCOUNT_ID`)
  - https://nearblocks.io/address/w3a-relayer.near

## Desired deployment mapping (one-time decisions)

- [ ] Choose Cloudflare resource names (recommended to mirror existing patterns):
  - [x] Relay Worker: `w3a-relay-mainnet`
  - [x] Wallet iframe Pages project: `w3a-wallet-iframe-mainnet`
  - [x] Docs Pages project: `w3a-tatchi-docs-mainnet`
- [ ] Choose/confirm public domains:
  - [x] Relay: `https://relay-mainnet.tatchi.xyz`
  - [x] Wallet iframe: `https://wallet-mainnet.web3authn.org`
  - [x] Docs: decide a dedicated mainnet docs origin (e.g. `https://mainnet.tatchi.xyz`)
    - This matters because the relay Worker CORS allowlist uses `EXPECTED_ORIGIN` + `EXPECTED_WALLET_ORIGIN`.

## Phase 1 — GitHub setup (branch + environment)

- [ ] Create branch `mainnet` (from the commit you want to deploy).
- [ ] Protect branch `mainnet` (recommended):
  - [ ] Require PRs + status checks (`ci`).
  - [ ] Restrict who can push.
- [ ] Create GitHub Environment `mainnet`.
- [ ] Configure Environment `mainnet` protections (recommended):
  - [ ] Required reviewers for deployment jobs (human approval for mainnet deploys).
  - [ ] (Optional) Wait timer.
- [ ] In Environment `mainnet`, set **Variables** to the values in “Target config”.
- [ ] In Environment `mainnet`, set required **Secrets** for deploy workflows:
  - [ ] `CLOUDFLARE_API_TOKEN` (needs Workers + Pages permissions; and Email Routing if you use the relay workflow’s Email Routing step)
  - [ ] `CLOUDFLARE_ACCOUNT_ID`
  - [ ] `CLOUDFLARE_ZONE_ID` (zone that owns `RECOVER_EMAIL_RECIPIENT` domain for Email Routing rules)
  - [ ] (Optional) `THRESHOLD_ED25519_MASTER_SECRET_B64U` (only if using threshold signing)

## Phase 2 — Cloudflare setup (Workers, Pages, DNS, Email Routing)

### 2.1 Relay Worker (mainnet)

- [ ] Add a `mainnet` worker environment in `examples/relay-cloudflare-worker/wrangler.toml`:
  - [ ] `[env.mainnet] name = "w3a-relay-mainnet"`
  - [ ] `[env.mainnet.vars]` values:
    - [ ] `RELAYER_ACCOUNT_ID="w3a-relayer.near"`
    - [ ] `NETWORK_ID="mainnet"`
    - [ ] `NEAR_RPC_URL="https://rpc.fastnear.com"`
    - [ ] `WEBAUTHN_CONTRACT_ID="w3a-v1.near"`
    - [ ] `RELAYER_URL="https://relay-mainnet.tatchi.xyz"`
    - [ ] `EXPECTED_WALLET_ORIGIN="https://wallet-mainnet.web3authn.org"`
    - [ ] `EXPECTED_ORIGIN="<mainnet docs origin>"` (pick the docs origin you decided above)
    - [ ] Keep `ACCOUNT_INITIAL_BALANCE` and `CREATE_ACCOUNT_AND_REGISTER_GAS` aligned with your mainnet policy.
- [ ] Ensure the Worker is reachable at `https://relay-mainnet.tatchi.xyz` (Cloudflare Worker route/custom domain).
- [ ] Set Worker secrets for the `mainnet` environment (Cloudflare-side, via Wrangler; they persist across deploys):
  - [ ] `RELAYER_PRIVATE_KEY`
  - [ ] `SHAMIR_P_B64U`
  - [ ] `SHAMIR_E_S_B64U`
  - [ ] `SHAMIR_D_S_B64U`
  - [ ] (Optional) `THRESHOLD_ED25519_MASTER_SECRET_B64U`

### 2.2 Email Routing (mainnet)

- [ ] Enable Cloudflare Email Routing for the zone that receives `RECOVER_EMAIL_RECIPIENT` (e.g. `web3authn.org`).
- [ ] Ensure `RECOVER_EMAIL_RECIPIENT` is unique per environment to avoid collisions:
  - The relay deploy workflow deletes/recreates Email Routing rules for the recipient, so if another env uses the same recipient, the most recent deploy wins.
  - Example split: `recover@web3authn.org` → mainnet relayer, `recover-testnet@web3authn.org` → testnet relayer.

### 2.3 Cloudflare Pages (wallet iframe + docs)

- [ ] Create Pages projects (or let first deploy auto-create them):
  - [ ] `w3a-wallet-iframe-mainnet`
  - [ ] `w3a-tatchi-docs-mainnet`
- [ ] Set each Pages project **Production branch** to `mainnet` (so `mainnet` pushes deploy as Production).
- [ ] Attach custom domains:
  - [ ] `wallet-mainnet.web3authn.org` → `w3a-wallet-iframe-mainnet`
  - [ ] `<mainnet docs domain>` → `w3a-tatchi-docs-mainnet`

## Phase 3 — Add GitHub workflows (mainnet)

Create mainnet versions by copying the existing `*-prod.yml` workflows and changing only the branch/environment/resource identifiers.

### 3.1 `.github/workflows/deploy-relay-mainnet.yml`

- [ ] Trigger: push to `mainnet` (and `workflow_dispatch`).
- [ ] Job environment: `mainnet`.
- [ ] Worker name: `w3a-relay-mainnet`.
- [ ] Deploy command: `wrangler deploy --env mainnet ...`
- [ ] Email Routing step uses `RECOVER_EMAIL_RECIPIENT` from `vars` and `CLOUDFLARE_ZONE_ID` from `secrets`.

### 3.2 `.github/workflows/deploy-wallet-iframe-mainnet.yml`

- [ ] Trigger: push to `mainnet` (and `workflow_dispatch`).
- [ ] Job environment: `mainnet`.
- [ ] Pages project: `w3a-wallet-iframe-mainnet`.
- [ ] Deploy command uses `--branch mainnet`.
- [ ] Build step reads the `VITE_*` vars from the `mainnet` GitHub Environment (see “Target config”).

### 3.3 `.github/workflows/deploy-docs-mainnet.yml`

- [ ] Trigger: push to `mainnet` (and `workflow_dispatch`).
- [ ] Job environment: `mainnet`.
- [ ] Pages project: `w3a-tatchi-docs-mainnet`.
- [ ] Deploy command uses `--branch mainnet`.
- [ ] Build step reads the `VITE_*` vars from the `mainnet` GitHub Environment (see “Target config”).

## Phase 4 — First deploy + verification checklist

- [ ] Run each workflow once via `workflow_dispatch` (so you can watch logs and fail fast).
- [ ] Relay:
  - [ ] `https://relay-mainnet.tatchi.xyz/healthz` returns 200
  - [ ] CORS allows the chosen docs origin and `https://wallet-mainnet.web3authn.org`
  - [ ] Mainnet calls succeed (network id, RPC, contract id)
- [ ] Wallet iframe:
  - [ ] Loads at `https://wallet-mainnet.web3authn.org`
  - [ ] Passkey registration/auth works with RP ID base `web3authn.org`
  - [ ] Wallet talks to the mainnet relay URL and account id
- [ ] Docs:
  - [ ] Deploys to `<mainnet docs origin>` and uses the mainnet `VITE_*` config
  - [ ] Embedded wallet flow works end-to-end against mainnet relay
- [ ] Email recovery:
  - [ ] Email sent to `recover@web3authn.org` triggers Cloudflare Email Routing → Worker `w3a-relay-mainnet`
  - [ ] Recovery completes successfully

## Rollback (minimum viable)

- [ ] Re-run the last known good workflow run for each component (Worker/Pages are immutable-ish per deploy and easy to redeploy).
- [ ] If Email Routing was changed, re-run the workflow that should “own” the recipient (it recreates the routing rule).
