# Web3‑Authn SDK Security Audit Plan

This plan defines scope, methodology, and concrete checklists to audit the SDK and its reference deployments. It adapts guidance from: Valkyri wallet extension pentesting, Cossack Labs crypto wallet risks, and SlowMist wallet audit topics.

Audit emphasis is on: browser iframe isolation + message channels, WebAuthn PRF usage, WASM crypto correctness, secure defaults in confirmation UX, asset/worker loading, and example relayer (Cloudflare Worker) security.


# Critical/High Issues — Ranked

1) Host adopts MessagePort without checking sender window (HIGH, P1)
- Risk: A non‑parent window could CONNECT first and receive the READY port, enabling message hijack or confusion.
- Evidence: sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:302, sdk/src/core/WalletIframe/host/messaging.ts:34
- Fix: Before `adoptPort`, require `if (e.source !== window.parent) return;`. Also ignore subsequent CONNECTs once bound.

2) Transaction intent digest parity not enforced (HIGH, P1)
- Risk: UI shows one set of actions while a modified payload gets signed (TOCTOU) if digest equality isn’t enforced.
- Evidence: sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs:240–314
- Fix: Assert UI‑provided `intentDigest` equals WASM‑computed digest or abort signing with a clear error.

3) Relay CORS defaults to allow all when env not set (HIGH, P1)
- Risk: In production misconfig, attacker origins can call the relay.
- Evidence: examples/relay-cloudflare-worker/src/worker.ts:77–83
- Fix: Fail closed unless an explicit allowlist is provided; document production guidance.

Notes
- Severities use P0 (Critical) / P1 (High) / P2 (Medium). No P0 found in pass 1.
- See per‑section files for details and additional P2 items.


---

## Scope & Assets

- SDK TypeScript runtime and React/Lit components (embedded confirmation UI)
- Wallet Iframe Host + Client transport
  - Host: `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts`
  - Client transport: `sdk/src/core/WalletIframe/client/IframeTransport.ts`
  - Handlers: `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts`
- WebAuthn Manager + PRF handling: `sdk/src/core/WebAuthnManager/**`
- WASM workers
  - Signer: `sdk/src/wasm_signer_worker/**`
  - VRF: `sdk/src/wasm_vrf_worker/**`
- Near client + transaction building: `sdk/src/core/NearClient.ts`
- Build + dev plugins, asset/headers emit: `sdk/src/plugins/vite.ts`
- CI + packaging, lockfiles
- Examples (docs sites excluded from security scope, except headers/CSP where relevant)
- Relay (Cloudflare Worker example): `examples/relay-cloudflare-worker/src/worker.ts`

Out of scope for this pass: smart contracts, NEAR RPC nodes, third‑party hosted sites that embed the wallet beyond configuration checks.

---

## Methodology

- Architecture + threat modeling per boundary (parent app ↔ wallet iframe ↔ workers ↔ relayer ↔ chain)
- Code review with targeted static checks (TS, Rust) and test harness augmentation
- Dynamic testing via Playwright (handshake, confirmation UI, PRF flows)
- Misuse/abuse testing for message routing, UI redress (clickjacking), WebAuthn bridge
- Cryptographic review (HKDF domains, PRNG/nonces, key lifetimes, VRF, Shamir3pass params)
- Supply chain + deployment headers/CSP review (Vite dev plugin, emitted _headers)

---

## Threat Model (high level)

- Assets
  - WebAuthn credentials (hardware‑backed), PRF outputs, derived keys (in memory), encrypted key material at rest (IndexedDB), session VRF state
  - Transaction intent and confirmation integrity
- Adversaries
  - Malicious embedding page or compromised sibling frame
  - Network attacker (MITM), malicious CDN/asset origin mis‑config
  - Supply chain compromise (npm/crates), CI mis‑config
- Boundaries
  - Cross‑origin iframe boundary (MessageChannel, window.postMessage)
  - WebAssembly worker boundary (TS ↔ Rust/WASM)
  - Cloudflare Worker ↔ browser ↔ NEAR RPC

---

## Checklist A — Messaging, Isolation, and Iframe Hardening

Grounded in Valkyri pentesting patterns adapted for iframes.

- Iframe creation and capabilities
  - Verify no `sandbox` is applied cross‑origin; Permissions-Policy delegates only required features
    - Check allow attr composition for wallet origin: `publickey-credentials-get/create`, clipboard
      - Evidence: `sdk/src/core/WalletIframe/client/IframeTransport.ts:323`
  - Confirm host page deploys COOP/COEP and CORP where expected (dev/build plugins)
    - Evidence: `sdk/src/plugins/vite.ts` dev headers and `_headers` emitter
- Handshake robustness
  - Parent strictly targets wallet origin once host boot observed; tolerate `null` origin only for CONNECT retries
    - Evidence: `sdk/src/core/WalletIframe/client/IframeTransport.ts:241` targetOrigin logic
  - Host adopts MessagePort only via parent window; record parent origin once non‑null
    - Evidence: `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:302`
  - Action: consider restricting adoption to `e.source === window.parent` and ignoring others (low risk but defense‑in‑depth)
- PostMessage channels
  - Host only posts to `window.parent`; uses `*` until concrete origin is known — safe given targetWindow is parent
    - Evidence: `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:155`
  - Client only accepts WebAuthn bridge messages from wallet origin
    - Evidence: `sdk/src/core/WalletIframe/client/IframeTransport.ts:91`
- Message validation
  - Ensure all host handlers validate payload shapes before use
    - Evidence: consolidated handler map and `isObject` guards in host router; targeted review of each PM_* handler
  - Test: fuzz malformed envelopes and ensure graceful `ERROR` with no state changes
- Clickjacking/UI redress
  - Embedded control surfaces (Lit mounter) operate in wallet iframe; ensure no parent CSS can overlay wallet UI to trick clicks
    - Confirm UI surfaces are fully inside wallet iframe with their own DOM/CSS root
  - If any parent‑hosted UI exists, verify hardening (opaque overlays, pointer‑events guards)
- Cancellation + race conditions
  - Confirm PM_CANCEL properly clears state across handlers and UI
    - Evidence: `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:261`

---

## Checklist B — WebAuthn + PRF Handling

- RP ID strategy, Related Origin Requests (ROR)
  - Verify rpIdOverride and ROR manifest flows per docs; ensure mismatch cases degrade safely
  - Check Permissions‑Policy delegation and `.well-known/webauthn` behavior in examples
- PRF extraction and encoding
  - Validate PRF outputs are present and base64url encoded, fallbacks handled
    - Evidence: `sdk/src/core/WebAuthnManager/credentialsHelpers.ts:54`
- Bridge in Safari/Firefox gaps
  - Parent‑performed `navigator.credentials.*` bridge only trusted from wallet origin; results are serialized before worker use
    - Evidence: `sdk/src/core/WalletIframe/client/IframeTransport.ts:323`
- Credential serialization type‑safety before WASM
  - Evidence: `sdk/src/core/WebAuthnManager/credentialsHelpers.ts:117` and `:160`
- Wallet‑scoped vs app‑scoped credentials (policy)
  - Review per `docs/wallet-scoped-credentials.md` for deployment posture; ensure defaults safe for cross‑origin embedding

---

## Checklist C — Confirmation UX Integrity

- Intent digest linkage
  - Ensure digest computed in WASM over the same JSON structure rendered to user
    - Evidence: `sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs` digest + summary construction
- UI mode policies
  - Default requires explicit click; `autoProceed` allowed only with tight constraints and logging
  - Verify normalization enforces safe defaults and ignores invalid combos
- Anti‑tampering
  - Ensure tx details parser rejects malformed/overflow values and totals
  - Test: modify tx payload between UI display and sign; verify digest mismatch aborts
- Cancellation behavior
  - Verify immediate terminal CANCELLED error emission and UI teardown

---

## Checklist D — Cryptography and Key Material

Derived from Cossack Labs and SlowMist topics; focus on algorithm choices, KDF, randomness, and key lifecycle.

- PRNG and nonces
  - Nonces generated via `getrandom` with correct size; ChaCha20‑Poly1305 AEAD used
    - Evidence: `sdk/src/wasm_signer_worker/src/crypto.rs:70`
- HKDF domain separation
  - Separate info strings and salts for ChaCha20 and Ed25519 derivations; account‑specific salts
    - Evidence (HKDF): `sdk/src/wasm_signer_worker/src/crypto.rs:40`, `:142`
- Ed25519 implementations
  - Using `ed25519-dalek`; ensure constant‑time operations and no custom curve code
  - Near key format handling (32 vs 64 bytes) correctly parsed
    - Evidence: `sdk/src/wasm_signer_worker/src/crypto.rs:150`, `:240`
- Key encryption at rest
  - Ed25519 private key encrypted with ChaCha20‑Poly1305 using PRF‑derived key; AEAD nonce stored; base64url encoding
    - Evidence: `sdk/src/wasm_signer_worker/src/crypto.rs:193`
- Zeroization/memory hygiene
  - Review for wiping sensitive buffers (currently none); recommend `zeroize` for seeds and derived keys after use
- VRF and Shamir3pass parameters
  - Validate domain separator and HKDF info for VRF; Shamir minimum prime bits and sampling settings
    - Evidence: `sdk/src/wasm_vrf_worker/src/config.rs:21`, `:53`
- Randomness and key derivation misuse
  - Confirm no reuse of PRF outputs across unrelated purposes without domain separation
  - Ensure no deterministic nonces; unique per encryption

---

## Checklist E — Storage, Logs, Privacy

- IndexedDB/Storage
  - Encrypted key blobs only; no plaintext secrets serialized to storage or logs
- Logging
  - Verify no sensitive material appears in `debug/info` logs (PRF outputs, keys)
  - Build with sane default log levels in production (Info or lower; avoid Debug for secrets)
- PII minimization
  - Avoid storing email/identifiers beyond NEAR account IDs where unnecessary

---

## Checklist F — Supply Chain and Build/Deploy

- JS/TS dependencies
  - Lockfile review (`pnpm-lock.yaml`), audit direct prod deps, pin versions; run `pnpm audit` and review exceptions
- Rust crates
  - `cargo audit` and `cargo deny` policy; `rustc` target `wasm32-unknown-unknown` consistency
- Build outputs
  - Ensure workers + WASM are loaded from wallet origin only in prod; prevent mixed‑origin surprises
  - Verify `_headers` emission for COOP/COEP and Permissions‑Policy
- CI/Actions
  - Review secrets usage and least‑privileged tokens; ensure no plaintext secrets in logs
- Reproducibility
  - Document deterministic builds path; verify no network at build time beyond pinned registries

---

## Checklist G — Cloudflare Worker (Relay) Security

- Inputs and CORS
  - CORS allowlist assembled from env; defaults to `*` only when not set—confirm operational posture
    - Evidence: `examples/relay-cloudflare-worker/src/worker.ts:77`
  - Normalize origins and strip path/query; reject malformed entries
    - Evidence: `examples/relay-cloudflare-worker/src/worker.ts:52`
- Secrets handling
  - `RELAYER_PRIVATE_KEY` stored in env bindings only; never logged or returned
- Rate limiting and abuse
  - Consider basic rate limit/DoS defenses or Cloudflare Managed rules for sensitive endpoints
- ROR manifest
  - Serve `/.well-known/webauthn` on wallet domain with canonicalized origins; cache headers and sanitization

---



## References

- Valkyri wallet extension pentesting checklist (adapted for iframe threat model)
- Cossack Labs – Crypto wallet security (randomness, KDFs, key storage, UI/UX risks)
- SlowMist wallet security audit topics (storage, signature flows, transaction risks)

---

## Appendix — Evidence Pointers

- Handshake and adoption
  - Host adopt + parent origin capture: `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:295`
  - Client CONNECT retries + target origin: `sdk/src/core/WalletIframe/client/IframeTransport.ts:246`
- WebAuthn bridge
  - Accept only wallet origin; serialize credentials with PRF: `sdk/src/core/WalletIframe/client/IframeTransport.ts:323`
- PRF extraction and serialization
  - `sdk/src/core/WebAuthnManager/credentialsHelpers.ts:54`, `:117`, `:160`
- Crypto derivations and AEAD
  - `sdk/src/wasm_signer_worker/src/crypto.rs:23`, `:58`, `:119`, `:172`
- VRF/Shamir parameters and domains
  - `sdk/src/wasm_vrf_worker/src/config.rs:21`, `:53`
- Dev/Build headers + Permissions‑Policy
  - `sdk/src/plugins/vite.ts` (dev headers and emitted `_headers`)

