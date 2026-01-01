---
title: Server
---

# Server

Server-side building blocks used by the examples and tests.

## Main exports

- `AuthService` – relayer operations (account creation + on-chain verification)
- `SessionService` – optional JWT/cookie session adapter used by the routers
- Routers:
  - Express: `createRelayRouter` from `@tatchi-xyz/sdk/server/router/express`
  - Cloudflare: `createCloudflareRouter` (+ `createCloudflareCron`) from `@tatchi-xyz/sdk/server/router/cloudflare`
- Shamir 3-pass:
  - Server-side helpers and handlers in `@tatchi-xyz/sdk/server` (and wired into the routers under `/vrf/*`)
- Email recovery:
  - `POST /recover-email` route (routers) + `service.emailRecovery.requestEmailRecovery(...)` (advanced)

The most complete, up-to-date integration examples live in `sdk/src/server/README.md` and `examples/relay-server` / `examples/relay-cloudflare-worker`.
