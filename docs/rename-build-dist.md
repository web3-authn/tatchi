# Plan: Remove `/sdk/embedded/*` and unify on `/sdk/*`

Goal
- Make development and production file paths identical and future‑proof: emit embedded bundles to `dist/esm/sdk/*` and serve them under `/sdk/*`.
- Remove `/sdk/embedded/*` entirely (no redirects) in the next breaking release to eliminate confusion.

Scope
- Build outputs (rolldown), dev server plugin, wallet service HTML, runtime base resolution, CI deploy scripts, examples, tests, and docs.

High‑level Changes
1) Emit embedded artifacts to `dist/esm/sdk/*` instead of `dist/esm/react/embedded/*`.
2) Serve at `/sdk/*` (canonical) only; do not serve `/sdk/embedded/*`.
3) Update all code paths and docs to reference `/sdk/*`.

Detailed Steps

1. Build outputs (rolldown)
- File: `passkey-sdk/rolldown.config.ts`
  - Change every output dir currently using ``${BUILD_PATHS.BUILD.ESM}/react/embedded`` to ``${BUILD_PATHS.BUILD.ESM}/sdk`` for:
    - w3a-button-with-tooltip.js
    - iframe-tx-button-bootstrap.js
    - w3a-iframe-tx-confirmer.js
    - iframe-tx-confirmer-bootstrap.js
    - wallet-iframe-host.js
    - tx-confirm-ui.js
    - export-private-key-viewer.js
    - halo-border.js, passkey-halo-loading.js (standalone bundles)

2. Runtime base constants
- File: `passkey-sdk/src/core/WebAuthnManager/LitComponents/tags.ts`
  - Update `EMBEDDED_SDK_BASE_PATH` from `'/sdk/embedded/'` to `'/sdk/'`.
- File: `passkey-sdk/src/core/WebAuthnManager/LitComponents/asset-base.ts`
  - Update the fallback base from `'/sdk/embedded/'` to `'/sdk/'`.

3. Wallet service HTML & generator
- File: `passkey-sdk/src/core/WalletIframe/client/html.ts`
  - Load `${sdkBasePath}/wallet-iframe-host.js` (no `/embedded/`).
- Dev Vite plugin wallet service HTML (in `passkey-sdk/src/plugins/vite.ts`) should also reference `${sdkBasePath}/wallet-iframe-host.js`.

4. Dev plugin (Vite)
- File: `passkey-sdk/src/plugins/vite.ts`
  - `web3authnServeSdk`: update file lookup order to try `dist/esm/sdk/<rel>` first, then `dist/esm/<rel>`, then `dist/<rel>` (drop `react/embedded`).
  - Serve only `/sdk/*` during dev. Remove `/sdk/embedded/*` mapping.
  - `web3authnWalletService`: reference `${sdkBasePath}/wallet-iframe-host.js`.

5. CI deploy (Cloudflare Pages/Worker)
- File: `.github/workflows/deploy-cloudflare.yml`
  - For the example site (vite‑secure): copy embedded bundles to `examples/vite-secure/dist/sdk/`.
  - For wallet‑only site (wallet‑dist): copy embedded bundles to `wallet-dist/sdk/` and reference `/sdk/wallet-iframe-host.js` in `wallet-service/index.html`.
  - Remove any copying to `/sdk/embedded/*`.

6. Examples & env
- Files: `examples/vite/.env.development.local`, `examples/vite-secure/.env.development.local`
  - Keep `VITE_SDK_BASE_PATH=/sdk` (stable root). No change needed beyond server mapping.
- Files: any example HTML/scripts referencing `/sdk/embedded/*` → replace with `/sdk/*`.

7. Hosts: base resolution
- Files:
  - `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host.ts`
  - `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/iframe-host.ts`
  - `passkey-sdk/src/core/WebAuthnManager/LitComponents/ExportPrivateKey/iframe-host.ts`
  - Ensure all use `resolveEmbeddedBase()` which now defaults to `/sdk/`.
  - Keep “re‑init on base set” behavior; no other changes beyond the base.

8. Tests
- Update hard‑coded component module paths:
  - `passkey-sdk/src/__tests__/lit-components/button-with-tooltip.test.ts`
    - From `/sdk/esm/react/embedded/w3a-button-with-tooltip.js` to `/sdk/w3a-button-with-tooltip.js`.
  - Similar updates for any tests referencing `/embedded/` or deep `react/embedded` paths.

9. Docs
- Update all docs to reflect `/sdk/*` instead of `/sdk/embedded/*` or `/sdk/esm/react/embedded/*`.
  - `passkey-sdk/docs/*`
  - Example snippets in READMEs.

10. Backward compatibility
- None at runtime after the breaking release; `/sdk/embedded/*` will 404.
- Communicate in CHANGELOG and release notes; provide codemods/search‑and‑replace guidance for self‑hosters.

11. Validation
- Dev:
  - `VITE_SDK_BASE_PATH=/sdk`, start examples.
  - Verify child iframes load from `/sdk/*` (200, `application/javascript`).
  - Ensure Lit elements mount and shadowRoot is present.
- Prod:
  - Deploy `vite-secure` and `wallet-dist`.
  - Verify `/sdk/wallet-iframe-host.js` and bundles load with correct MIME types.
  - Confirm the wallet iframe sets `__W3A_EMBEDDED_BASE__` to `/sdk/` and embedded hosts render.
- Tests:
  - Run lit component tests and wallet‑iframe tests; all green.

12. Rollback plan
- If issues arise, revert plugin mapping and build outputs to prior `/react/embedded` and re‑deploy. No DB/state changes; rollback is a code deploy.

13. Timeline
- Day 0–1: Land build + plugin changes and update wallet service loaders.
- Day 1–2: Update workflows, examples, docs, tests.
- Day 2: Deploy to staging; validate.
- Day 3: Prod rollout in a breaking release. Monitor error logs for 404/MIME issues.

Search & Replace Checklist
- Grep queries to locate references:
  - `rg -n "/sdk/embedded|react/embedded|wallet-iframe-host.js"`
  - `rg -n "EMBEDDED_SDK_BASE_PATH|embedded base|/embedded/" passkey-sdk/src`
  - `rg -n "/sdk/esm/react/embedded|/sdk/esm/sdk"`

Out of scope
- Renaming package names or public APIs unrelated to asset paths.
- Changing the element tags or bundle filenames.
