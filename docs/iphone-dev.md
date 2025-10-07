Title: Develop on iPhone (Safari) with mDNS and Caddy

Overview
- Goal: load the secure example app from your iPhone at `https://pta-m4.local`, with the wallet iframe on `https://pta-m4.local:8443` and the relay on `https://pta-m4.local:8444`.
- Requirements: same Wi‑Fi, Caddy installed on the Mac, and the Caddy dev root certificate trusted on both Mac and iPhone (WebAuthn requires HTTPS).

1) Prepare Caddy for your Bonjour host
- File: examples/vite-secure/Caddyfile
- Added hosts for your Mac’s mDNS name (replace `pta-m4.local` if your name differs):
  - `pta-m4.local` → reverse proxy to Vite `:5174` (frontend)
  - `pta-m4.local:8443` → reverse proxy to Vite `:5174` (wallet origin, distinct by port)
  - `pta-m4.local:8444` → reverse proxy to `127.0.0.1:3000` (relay server)

2) Trust Caddy’s local CA
- On Mac: run `caddy trust` (the dev scripts already attempt this).
- On iPhone: export the CA from the Mac and trust it on the device:
  - Path on macOS: `~/Library/Application Support/Caddy/pki/authorities/local/root.crt`
  - Airdrop/email to the phone, install the profile, then enable trust:
    Settings > General > About > Certificate Trust Settings > enable full trust for the new root.

3) Allow the mDNS host in Vite
- Vite 6 blocks unlisted hosts by default. Update allowed hosts in:
  - examples/vite-secure/vite.config.ts: add `server.allowedHosts: ['example.localhost', 'wallet.example.localhost', 'pta-m4.local']`.
- This repo already includes that change. If you use a different Bonjour name, add it here.

4) iPhone‑specific env for vite‑secure
- File: examples/vite-secure/.env.iphone.local
- Key values:
  - `VITE_WALLET_ORIGIN=https://pta-m4.local:8443`
  - `VITE_RELAYER_URL=https://pta-m4.local:8444`
  - `VITE_RP_ID_BASE=pta-m4.local` (RP ID will be `pta-m4.local`)

5) Start the servers
- Relay (CORS to your iPhone origins):
  - Copy `examples/relay-server/env.example` to `.env` and set:
    - `EXPECTED_ORIGIN=https://pta-m4.local`
    - `EXPECTED_WALLET_ORIGIN=https://pta-m4.local:8443`
    - Fill `RELAYER_ACCOUNT_ID`, `RELAYER_PRIVATE_KEY`, and Shamir values as usual.
  - Run: `pnpm -C examples/relay-server dev`
- Secure example (iPhone mode + Caddy):
  - Run: `pnpm -C examples/vite-secure dev:iphone`

6) Open on iPhone
- Use HTTPS: `https://pta-m4.local` (not `http://`).
- Wallet iframe loads from `https://pta-m4.local:8443` and relay from `https://pta-m4.local:8444`.
- Remote debug (optional):
  - iPhone: Settings > Safari > Advanced > Web Inspector (enable)
  - macOS Safari: Develop > [Your iPhone] > select the page

Common errors and fixes
- Error: “Blocked request. This host ("pta-m4.local") is not allowed. To allow this host, add "pta-m4.local" to `server.allowedHosts` in vite.config.js`”
  - Fix: add your Bonjour name to `server.allowedHosts` in `examples/vite-secure/vite.config.ts` (already included in this repo for `pta-m4.local`).
- HMR not connecting over HTTPS
  - Optional: set `server.hmr` to point at your host/port (only if needed).
    Example: `server: { hmr: { protocol: 'wss', host: 'pta-m4.local', clientPort: 443 } }`.
- WebAuthn errors about RP ID mismatch
  - RP ID is resolved to `pta-m4.local`. Re‑register credentials after switching from `example.localhost`.
- Certificate warnings
  - Ensure the iPhone trusts Caddy’s root. Re‑import `root.crt` and enable full trust.

Notes
- USB alone doesn’t expose your Mac’s `localhost` to the phone; mDNS + HTTPS is the simplest local solution.
- Using different ports for app/wallet/relay preserves distinct origins in dev while keeping a single host.

