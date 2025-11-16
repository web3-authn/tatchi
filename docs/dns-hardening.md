# DNS Hardening (Core)

Goal: keep rpId stable (`web3authn.org`), make `/.well-known/webauthn` highly available for ROR, and ensure the wallet iframe can fail over across multiple hosts under the same eTLD+1.

## Required Outcomes
- rpId remains `web3authn.org` so existing passkeys keep working.
- `https://web3authn.org/.well-known/webauthn` is globally reliable and fast.
- Wallet iframe can run from multiple subdomains: `wallet`, `wallet1`, `wallet2`, …

## Core Controls
- Multi‑provider authoritative DNS at apex with multi‑signer DNSSEC (publish multiple DS at the registry).
- Short, sane TTLs (e.g., 300s for A/AAAA/CNAME; 600–900s for NS); actively monitor resolution and DNSSEC validity.
- Minimal apex service for `/.well-known/webauthn`, fronted by a CDN, independent of wallet hosting infrastructure.
- Multiple wallet hosts on diverse providers/CDNs: `wallet.web3authn.org`, `wallet1.web3authn.org`, `wallet2.web3authn.org`. Optionally delegate sub‑zones to different DNS providers.
- Separate TLS certificates per subdomain with automated renewal and expiry monitoring; stagger expirations.
- Parent app headers delegate WebAuthn to all wallet hosts via Permissions‑Policy:
  - `publickey-credentials-get/create=(self "https://wallet.web3authn.org" "https://wallet1.web3authn.org" "https://wallet2.web3authn.org")`
- ROR allowlist at `/.well-known/webauthn` includes parent app origins and all wallet subdomains that call WebAuthn.
- Client runtime: health‑probe candidate wallet hosts, pick the first healthy, cache with TTL; add `<link rel="preconnect">` for latency.
- Governance: enable registrar/registry locks; require hardware keys + MFA; split administrative custody; keep a simple failover runbook.

## Minimal Record Sketch (illustrative)
```
; apex (fronted by CDN serving /.well-known/webauthn)
@      300 IN A     203.0.113.10
@      300 IN AAAA  2001:db8::10
www    300 IN CNAME apex-cdn.example.net.
; wallet hosts on diverse infra
wallet   300 IN CNAME wallet-edge-a.cdn.net.
wallet1  300 IN CNAME wallet-edge-b.cdn.net.
wallet2  300 IN CNAME wallet-edge-c.cdn.net.
; optional sub-zone delegation for added diversity
wallet1  900 IN NS ns1.providerB.net.
wallet1  900 IN NS ns2.providerB.net.
```

## Quick Checks
- `dig +dnssec web3authn.org` verifies DNSSEC; both providers answer consistently.
- `curl -sS https://web3authn.org/.well-known/webauthn` is fast and available from multiple regions.
- Parent app responses include Permissions‑Policy allowing all wallet hosts.
- Simulated wallet host outage triggers client rotation without breaking ROR or rpId.
