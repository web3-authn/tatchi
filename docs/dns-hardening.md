# DNS Hardening (High‑Impact Basics)

Goal: keep the rpId (`web3authn.org`) usable during ordinary DNS/provider outages and keep `/.well-known/webauthn` reliably reachable. This is about availability and misconfig, not registry‑level domain seizure.

## What DNS Can and Can’t Do

- DNS **can** help you survive:
  - One DNS provider going down or being misconfigured.
  - A CDN or wallet host being temporarily unreachable.
- DNS **cannot** protect against:
  - The domain itself being reassigned or seized at the registry/registrar level. WebAuthn ties rpId to DNS + TLS, so a seized `web3authn.org` is, by design, a new root of trust.
- For that worst case we rely on **offline key export** as the safety valve:
  - The wallet’s offline‑export PWA is cached locally via a service worker and can decrypt/export keys without talking to `web3authn.org` once it has been primed on a device.

## Two Practical Controls

1. **Two DNS providers + DNSSEC at the apex**
   - Host `web3authn.org` authoritative records with at least two independent providers.
   - Enable DNSSEC and publish DS records at the registry; keep both providers’ zones signed.
   - Use short but reasonable TTLs (e.g., `300s` for A/AAAA/CNAME; `600–900s` for NS) and alert on:
     - DNSSEC failures or DS/key mismatches.
     - One provider returning empty/incorrect answers while the other is healthy.

2. **Minimal apex, CDN‑fronted `/.well-known/webauthn`, and wallet host failover**
   - Keep the apex (`web3authn.org`) as simple as possible:
     - Serve `/.well-known/webauthn` from a small, boring static origin.
     - Optionally redirect UX traffic to wallet/docs hosts.
   - Put this apex origin behind a mainstream CDN that can be moved or replaced quickly.
   - Host the wallet iframe on one or more subdomains (`wallet.web3authn.org`, `wallet2.web3authn.org`, …) and let the client SDK:
     - Probe a list of candidate wallet hosts.
     - Fail over when a wallet host or CDN is down, without changing the rpId.

## Quick Checks

- `dig +dnssec web3authn.org`:
  - DNSSEC OK.
  - Both providers returning consistent A/AAAA/NS answers.
- `curl -sS https://web3authn.org/.well-known/webauthn`:
  - Fast and available from multiple regions.
- Simulated wallet host outage:
  - Does **not** break ROR at the apex.
  - Triggers client‑side rotation to a healthy wallet subdomain while rpId remains `web3authn.org`.

