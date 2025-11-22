# DNS Hardening (High‑Impact Basics)

Goal: keep the wallet rpId domain (for example, `web3authn.org`) usable during ordinary DNS/provider outages and keep `/.well-known/webauthn` reliably reachable. This is about availability and misconfig, not registry‑level domain seizure.

For reference on how wallet‑scoped credentials and `/.well-known/webauthn` are wired today, see:
- `sdk/docs/deployment/wallet-scoped-credentials.md`
- `sdk/docs/implementation/offline-export.md`

## What DNS Can and Can’t Do

- DNS **can** help you survive:
  - One DNS provider going down or being misconfigured.
  - A CDN or wallet host being temporarily unreachable.
- DNS **cannot** protect against:
  - The domain itself being reassigned or seized at the registry/registrar level. WebAuthn ties rpId to DNS + TLS, so a seized rpId domain (e.g. `web3authn.org`) is, by design, a new root of trust.
- For that worst case we rely on **offline key export** as the safety valve:
  - The wallet’s offline‑export PWA is cached locally via a service worker and can decrypt/export keys without talking to the rpId domain once it has been primed on a device.

## Two Practical Controls

1. **Two DNS providers + DNSSEC at the apex**
   - Host the rpId domain’s authoritative records (for example, `web3authn.org`) with at least two independent providers.
   - Enable DNSSEC and publish DS records at the registry; keep both providers’ zones signed.
   - Use short but reasonable TTLs (e.g., `300s` for A/AAAA/CNAME; `600–900s` for NS) and alert on:
     - DNSSEC failures or DS/key mismatches.
     - One provider returning empty/incorrect answers while the other is healthy.

2. **Minimal wallet host, CDN‑fronted `/.well-known/webauthn`, and infrastructure‑level failover**
   - Keep the wallet origin that carries the rpId as simple as possible:
     - Serve `/.well-known/webauthn` and the wallet UI from a small, static site (for example, a Cloudflare Pages project).
     - Avoid mixing in unrelated app logic on that origin.
   - Put this origin behind a mainstream CDN or static hosting platform that can be moved or replaced quickly (R2/Pages, S3+CloudFront, etc.).
   - If you operate multiple wallet hosts (for example, `web3authn.org` and `wallet.tatchi.xyz`):
     - Treat each as a separate deployment and keep them consistent using the same release artifacts and manifests (see `docs/web4-hosting.md`).
     - Your app and relay infrastructure choose which `walletOrigin` to use; the SDK itself takes a single `walletOrigin` value and does not currently probe or rotate across multiple hosts.

## Quick Checks

- `dig +dnssec web3authn.org` (or your rpId domain):
  - DNSSEC OK.
  - All providers returning consistent A/AAAA/NS answers.
- `curl -sS https://web3authn.org/.well-known/webauthn` (or your wallet origin):
  - Fast and available from multiple regions.
- Simulated wallet host outage (for example, by disabling one CDN or Pages project):
  - Does **not** break `/.well-known/webauthn` when a healthy deployment remains.
  - Client apps can still establish WebAuthn sessions using the configured `walletOrigin` and rpId.
