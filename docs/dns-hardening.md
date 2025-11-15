# DNS Hardening Plan (rpId: web3authn.org)

Purpose: reduce downtime and censorship risk for wallet iframe hosts while keeping the rpId domain constant, and make the apex `/.well-known/webauthn` highly available for ROR.

## Objectives
- Keep rpId = `web3authn.org` unchanged so existing passkeys continue to work.
- Serve the wallet iframe from multiple subdomains (wallet, wallet1, wallet2, …) on diverse infrastructure.
- Make `https://web3authn.org/.well-known/webauthn` extremely reliable for ROR lookups.
- Use strong domain governance: registrar/registry locks, multi‑signer DNSSEC, short TTL + monitored failover.

## Threat Model (summarized)
- Hosting/CDN outage on one wallet host → fail over to another host under same eTLD+1.
- Single DNS provider outage → second authoritative provider continues to answer.
- TLD registry/registrar seizure or NS/DS changes → all subdomains fail together. Not fully preventable; mitigate via governance + rapid recovery.

## Architecture Options
- Multi‑provider authoritative DNS for apex (preferred):
  - Host the `web3authn.org` zone at two+ independent DNS providers simultaneously (dual‑primary or hidden‑primary + secondaries).
  - Use multi‑signer DNSSEC (RFC 8901): each provider signs; publish multiple DS at registry.
- Sub‑zone delegation per wallet host (supplemental):
  - Delegate `wallet1.web3authn.org`, `wallet2.web3authn.org`, `wallet3.web3authn.org` to different DNS providers. Parent apex must remain reachable.

## Recommended Pattern
1) Multi‑provider DNS at apex `web3authn.org` with multi‑signer DNSSEC.
2) Host multiple wallet iframe subdomains on diverse CDNs/origins:
   - `wallet.web3authn.org` → CDN/Infra A
   - `wallet1.web3authn.org` → CDN/Infra B
   - `wallet2.web3authn.org` → CDN/Infra C
3) Keep `/.well-known/webauthn` implementation at apex tiny and independently hosted behind a CDN, with short TTLs and health‑checked failover.

## Step‑by‑Step Implementation
1) Domain governance
   - Enable registry lock at the registrar for `web3authn.org`.
   - Require hardware keys + MFA for registrar and DNS provider accounts; split admin custody.
2) Choose DNS providers (any two+ with DNSSEC + multi‑signer support):
   - Examples: Cloudflare DNS, NS1/IBM, Route 53, Google Cloud DNS, Azure DNS, DNS Made Easy.
3) Multi‑provider apex zone
   - Create/import `web3authn.org` zone at Provider A and Provider B.
   - Configure identical NS glue at the registry to publish both providers’ nameservers (per provider instructions).
   - Enable DNSSEC on both; obtain DS records from each; publish multiple DS at the registry (multi‑signer).
   - Set zone TTLs to moderate values (e.g., 300s for A/AAAA/CNAME; NS 600–900s). Avoid ultra‑short NS TTLs if provider disallows.
4) Apex records and `/.well-known/webauthn`
   - Point `web3authn.org`/`www` to a minimal stack (static or serverless) dedicated to serving `/.well-known/webauthn`.
   - Front with a CDN (multi‑region, health checks). Keep code minimal; no dynamic dependencies beyond the ROR RPC call.
5) Wallet hosts under same eTLD+1
   - Create A/AAAA or CNAME for:
     - `wallet.web3authn.org` → CDN/Infra A
     - `wallet1.web3authn.org` → CDN/Infra B
     - `wallet2.web3authn.org` → CDN/Infra C
   - Optionally delegate sub‑zones:
     - Add NS records at apex for `wallet1.web3authn.org`, `wallet2.web3authn.org`, each to their provider’s NS set.
6) TLS certificates
   - Issue independent certs per subdomain (avoid one wildcard for all). Automate renewal (ACME HTTP‑01/TLS‑ALPN‑01). For delegated sub‑zones, use DNS‑01 at the respective provider.
   - Stagger expirations; monitor for expiry.
7) Permissions‑Policy and ROR allowlists
   - Parent app must delegate to all potential wallet hosts:
     - `publickey-credentials-get/create=(self "https://wallet.web3authn.org" "https://wallet1.web3authn.org" "https://wallet2.web3authn.org")`
   - Ensure `https://web3authn.org/.well-known/webauthn` allowlist includes all embedding origins (e.g., `https://hosted.tatchi.xyz`) and all wallet subdomains that will call WebAuthn.
8) Runtime host selection
   - Implement health‑probe/handshake across candidate wallet hosts; pick the first healthy one and cache choice with TTL.
   - Preconnect (`<link rel="preconnect">`) to candidate hosts to reduce latency.
9) Monitoring + alerts
   - Monitor:
     - NS/DS consistency (both providers answering, DNSSEC valid).
     - Apex `/.well-known/webauthn` latency/availability from multiple regions.
     - TLS expiry per subdomain.
     - CDN origin health for each wallet host.
   - Alert channels with on‑call rotation.
10) Runbook (failover/recovery)
   - If a wallet host fails: remove from rotation; promote a hot spare (wallet2); communicate status.
   - If a DNS provider fails: verify the other provider answers; keep serving; prepare to remove broken NS if required.
   - If apex service degrades: switch CDN origin for `/.well-known/webauthn` to standby; confirm health.
   - If registrar/registry event suspected: escalate, execute registry‑lock procedures, communicate outage; note that all subdomains are affected.

## Example Records (illustrative)
Zone apex at both providers:
```
; web3authn.org apex
@   300 IN A     203.0.113.10    ; CDN A anycast
@   300 IN AAAA  2001:db8::10
www 300 IN CNAME apex-cdn.example.net.
; wallet hosts
wallet  300 IN CNAME wallet-edge-a.cdn.net.
wallet1 300 IN CNAME wallet-edge-b.cdn.net.
wallet2 300 IN CNAME wallet-edge-c.cdn.net.
; optional sub-zone delegation
wallet1 900 IN NS ns1.providerB.net.
wallet1 900 IN NS ns2.providerB.net.
wallet2 900 IN NS ns1.providerC.net.
wallet2 900 IN NS ns2.providerC.net.
```

## Testing
- DNSSEC: validate with `dig +dnssec` and third‑party validators; ensure both providers’ RRSIGs verify.
- Failover: take down one wallet origin and confirm client rotation works; confirm no ROR regressions.
- ROR: from non‑web3authn.org origin, confirm browser fetches `/.well-known/webauthn` successfully; test from multiple regions.
- Headers: verify Permissions‑Policy in parent app responses includes all wallet hosts.

## Limitations/Notes
- Multi‑provider DNS reduces hosting/provider outages but does not prevent registry/registrar seizure or NS/DS tampering. Plan governance and legal processes; keep evidence and contacts ready.
- ROR depends on apex availability; caching is not reliable. Keep `/.well-known/webauthn` minimal and independently hosted.
- Sub‑zone delegation adds diversity but apex remains the parent SPOF; use both apex multi‑provider and sub‑zone delegation where feasible.

## Execution TODOs (Ordered)
1) Governance: enable registry lock; secure registrar/DNS accounts (hardware keys, split custody).
2) Select two DNS providers with multi‑signer DNSSEC; provision apex zone at both.
3) Publish both providers’ NS at registry; enable multi‑signer DNSSEC; publish multiple DS.
4) Stand up minimal `/.well-known/webauthn` service behind CDN; configure apex A/AAAA/CNAME.
5) Create wallet hosts at 2–3 providers (wallet, wallet1, wallet2) and point to independent CDNs/origins.
6) Optionally delegate wallet1/wallet2 sub‑zones to their providers with NS records.
7) Issue separate TLS certs per subdomain; automate renewals; add expiry monitors.
8) Update parent app headers to delegate Permissions‑Policy to all wallet hosts.
9) Ensure ROR allowlist at `https://web3authn.org/.well-known/webauthn` includes parent app origins and wallet subdomains.
10) Implement client health‑probe + rotation; add preconnects; test failover.
11) Configure monitoring/alerts for DNSSEC, apex well‑known, TLS, CDN origin health.
12) Document runbook and contacts; simulate tabletop failover and recovery.

Related files:
- docs/offline-export.md:1 — offline‑first export route plan (break‑glass).
- sdk/src/plugins/plugin-utils.ts:1 — ROR fetcher/caching helpers.
- templates/wallet-dist/_headers:1 — add Permissions‑Policy for wallet hosts.
