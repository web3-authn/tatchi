---
title: Overview
---

# Overview

Tatchi’s Web3‑Authn SDK lets you build a wallet experience where private keys never leave a dedicated wallet origin. The app embeds a wallet iframe, and all sensitive operations run there in WASM workers with strict CSP.

What you’ll do next:
- Install the SDK and plugin
- Configure the wallet iframe (wallet origin, service path)
- Register your first passkey and log in
- Send your first transaction with secure confirmation

## Self‑Hosted vs App‑Only
- App‑only (cross‑origin wallet): your app talks to a remote wallet origin; use `tatchiAppServer` in dev and `tatchiBuildHeaders` for prod.
- Self‑hosted (same domain wallet): you run the wallet origin (e.g., `wallet.example.com`); use `tatchiWalletServer` in dev and `tatchiBuildHeaders` on deploy.
See details in [Install & Configure](./install-and-configure#self-hosted-vs-app-only).

Next: [Install & Configure](./install-and-configure)
