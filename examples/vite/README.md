# Wallet Secure Dev Server (examples/vite-secure)

This app runs a dedicated wallet/service origin for local development. It serves a cross-origin WalletIframe page that hosts the Tatchi SDK, wasm signers, and related workers. The Vite dev plugin `@tatchi-xyz/sdk/plugins/vite` wires up the service route and SDK assets.

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

- This command runs `docs:build` before starting Vite so the `/docs` route always serves the latest static output.
- Ensure Caddy is running so the custom host is available. If you are running the main example app (`examples/vite`), its `run_caddy.sh` already proxies `wallet.example.localhost` to `127.0.0.1:5174`.

Open:
- `https://wallet.example.localhost/wallet-service` – the iframe service page
- `https://wallet.example.localhost` – splash page with links
- `https://example.localhost/docs` – Vocs docs site

## Notes

- The route `/wallet-service` is provided by the Vite plugin and loads `/sdk/wallet-iframe-host.js`.
- The dev server includes cross-origin isolation headers (COEP/COOP) and a WebAuthn `Permissions-Policy` (via `server.headers` and Caddy). Avoid setting conflicting headers in multiple places.
- The `/sdk/*` path is mapped by the plugin to the workspace `passkey-sdk/dist` (zero-copy). Keep the SDK in `dev` or re-run `build` after changes.
- The docs are prebuilt Vocs pages served as static assets under `https://example.localhost/docs`. Run `pnpm -C examples/vite-secure docs:build` whenever you edit markdown.
