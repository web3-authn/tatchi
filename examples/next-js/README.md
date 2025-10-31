Next.js cross‑origin example

- Wallet origin (dev): https://wallet.example.localhost (local wallet server)
- Purpose: minimal host app that delegates to wallet iframe; served via TLS proxy with proper headers

Quick start

1) Copy `.env.example` to `.env` and adjust values if needed.
   - Optionally set `NEXT_PUBLIC_WALLET_ORIGIN=https://wallet.example.localhost`
2) Start everything: `pnpm -C examples/next-js dev`
   - This runs: Next app (4200), wallet server (5174), and Caddy.
3) Open https://next.example.localhost
   - Wallet service is at https://wallet.example.localhost/wallet-service

Notes

- Headers: next.config.js injects Permissions‑Policy + CSP; wallet server injects strict headers for its HTML.
- Provider: `_app.tsx` sets wallet origin/relayer for dev UX.
- No manual `_headers` setup needed in dev; Caddy proxies TLS hosts to local servers.
