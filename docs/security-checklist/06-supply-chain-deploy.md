# Checklist F — Supply Chain and Build/Deploy

Findings snapshot (pass 1).

- P2: JS/TS dependencies
  - Evidence: pnpm-lock.yaml present; package exports stable; no dynamic fetches in build pipeline observed.
  - Recommendation: Run `pnpm audit` and review; pin critical prod deps; add `pnpm audit --prod` step to CI.

- P2: Rust crates
  - Recommendation: Add `cargo audit` to CI for both `wasm_signer_worker` and `wasm_vrf_worker`. Consider `cargo deny` for licenses/versions.

- P2: Build outputs served from wallet origin (good)
  - Evidence: Vite plugin emits `_headers` and serves `/wallet-service` + `/sdk/*` in dev; CI copies SDK assets into example’s `dist/sdk` for Pages.
  - Evidence: .github/workflows/deploy-wallet-iframe-prod.yml
  - Recommendation: Ensure production always resolves workers/WASM from wallet origin; never app origin.

- P2: Headers and Permissions‑Policy (good)
  - Evidence: sdk/src/plugins/vite.ts (dev headers and build `_headers`).
  - Recommendation: Confirm no duplicate/conflicting headers at proxy layer.

- P2: Secrets in CI
  - Evidence: Cloudflare token/IDs; ensure least privilege and mask in logs.
  - Recommendation: Static analysis for secrets leakage; avoid printing envs.

Action items
- [ ] Add `pnpm audit --prod`, `cargo audit`, and (optionally) `cargo deny` to CI (P2)
- [ ] Verify production worker/wasm URLs resolve to wallet origin (P2)
- [ ] Document deterministic build and lockfile refresh process (P2)

Hardening TODO
- Add a strict Content-Security-Policy to the wallet service page (P2) if it does not regress cross‑origin production setups or mobile Safari. Suggested baseline:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`
  - Validate with your deployment (Cloudflare Pages/Netlify) and test Safari/iOS.
