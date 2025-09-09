# Wallet Secure Dev Server (examples/vite-secure)

This app runs a dedicated wallet/service origin for local development. It serves a cross-origin WalletIframe page that hosts the Web3Authn SDK, wasm signers, and related workers.

- Dev server: `http://localhost:5174`
- Wallet origin (via Caddy): `https://wallet.example.localhost`
- Service path: `/wallet-service`
- SDK assets base: `/sdk/*` (served from `passkey-sdk/dist` in the workspace)

## Usage

- In one terminal, build or watch the SDK so `dist/` exists:
  - Watch: `pnpm -C passkey-sdk dev`
  - One-off build: `pnpm -C passkey-sdk build`
- In another terminal, start this dev server:

```
pnpm -C examples/vite-secure dev
```

- Ensure Caddy is running so the custom host is available. If you are running the main example app (`examples/vite`), its `run_caddy.sh` already proxies `wallet.example.localhost` to `127.0.0.1:5174`.

Open:
- `https://wallet.example.localhost/wallet-service` – the iframe service page
- `https://wallet.example.localhost` – splash page with links

## Notes

- The route `/wallet-service` renders HTML using the SDK helper `getWalletServiceHtml('/sdk')`, which references the embedded service host at `/sdk/esm/react/embedded/wallet-iframe-host.js`.
- The dev server includes strict cross-origin isolation headers (COEP/COOP) and a WebAuthn `Permissions-Policy`.
- The `/sdk/*` path is served directly from the workspace `passkey-sdk/dist` folder (zero-copy). Keep the SDK in `dev` or re-run `build` after changes.
