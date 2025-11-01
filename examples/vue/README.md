Vue (Vite) cross‑origin example

- Wallet origin (dev): https://wallet.example.localhost (local wallet server)
- Purpose: minimal host app using PasskeyManager; served via TLS proxy with proper headers

Quick start

1) Copy `.env.example` to `.env` and adjust values if needed.
   - Optionally set `VITE_WALLET_ORIGIN=https://wallet.example.localhost`
2) Start everything: `pnpm -C examples/vue dev`
   - This runs: app server (5176), wallet server (5174), and Caddy.
3) Open https://vue.example.localhost
   - Wallet service is at https://wallet.example.localhost/wallet-service

Notes

- Headers: vite.config.ts uses `tatchiServeSdk` + `tatchiHeaders` (app) and `tatchiDevServer` (wallet).
- UI: Input with username postfix + Register/Login using PasskeyManager.
- No manual `_headers` setup needed in dev; Caddy proxies TLS hosts to local Vite servers.
