# Checklist G — Cloudflare Worker (Relay) Security

Findings snapshot (pass 1).

- P1 (HIGH): CORS allowlist defaults to `*` when env not set
  - Description: If `EXPECTED_ORIGIN` and `EXPECTED_WALLET_ORIGIN` are unset, router uses `corsOrigins='*'`.
  - Evidence: examples/relay-cloudflare-worker/src/worker.ts:77–83
  - Recommendation: For production, require an explicit allowlist; default to deny.

- P2: Origin normalization (good)
  - Evidence: examples/relay-cloudflare-worker/src/worker.ts:52–72
  - Canonicalizes origin protocol/host/port and strips path/query/fragment.

- P2: Secrets handling
  - Evidence: Env bindings for `RELAYER_PRIVATE_KEY` and others; not logged.
  - Recommendation: Keep secrets out of logs; consider Cloudflare Secret Store and scoped tokens.

- P2: Rate limiting / abuse protections not present
  - Recommendation: Add cf Access/Managed Rules or custom rate limits for critical endpoints.

- P2: ROR manifest guidance
  - Recommendation: Ensure wallet host serves `/.well-known/webauthn` with canonicalized origins and cache headers; optionally proxy through this Worker.

Action items
- [ ] Fail closed when `EXPECTED_*` are absent (P1)
- [ ] Add basic rate limiting or cf Managed Rules (P2)
- [ ] Add integration test for CORS allowlist enforcement (P2)
