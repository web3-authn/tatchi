# Checklist A — Messaging, Isolation, and Iframe Hardening

Findings snapshot (pass 1). Severities: P0 critical, P1 high, P2 medium.

- P1 (HIGH): MessagePort adoption lacks `source` verification
  - Description: Wallet host adopts any CONNECT with a transferable `MessagePort` without checking `e.source === window.parent`. A non‑parent window that can obtain a reference to the iframe could attempt to connect first, influencing `parentOrigin` and receiving READY on its port.
  - Evidence:
    - sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:302
    - sdk/src/core/WalletIframe/host/messaging.ts:34
  - Recommendation: Require `if (e.source !== window.parent) return;` before adopting the port. Optionally, ignore subsequent CONNECTs if a port is already adopted.

- P2: Parent → CONNECT origin fallback to `*` during early boot is acceptable; switches to strict origin post‑boot
  - Description: Client uses `*` target for CONNECT until the wallet reports booted to avoid null‑origin issues, then uses strict `walletOrigin`.
  - Evidence: sdk/src/core/WalletIframe/client/IframeTransport.ts:241, sdk/src/core/WalletIframe/client/IframeTransport.ts:246
  - Recommendation: None. Keep as is; add a metric to observe wild‑card fallback frequency in dev.

- P2: Host → parent postMessage uses `*` until non‑opaque origin available
  - Description: `postToParent` targets `*` until `parentOrigin` is non‑null to avoid noisy ‘null’ origin. Target window is always `window.parent`.
  - Evidence: sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:155; sdk/src/core/WalletIframe/host/messaging.ts:13
  - Risk: Low (destination window fixed). Add a comment clarifying it is not a broadcast.

- P2: WebAuthn bridge messages validated by origin (good)
  - Description: Parent only processes bridge requests if `e.origin === walletOrigin`.
  - Evidence: sdk/src/core/WalletIframe/client/IframeTransport.ts:91
  - Recommendation: None.

- P2: Iframe capabilities hardened via `allow` (good)
  - Description: `allow` includes only WebAuthn get/create and clipboard; no sandbox in cross‑origin mode; hidden iframe styles enforced.
  - Evidence: sdk/src/core/WalletIframe/client/IframeTransport.ts:323, :292–313, tests: sdk/src/__tests__/wallet-iframe/handshake.test.ts:56
  - Recommendation: Consider adding `referrerpolicy="no-referrer"` to iframe as a mild privacy enhancement.

- P2: Handler payload validation is minimal
  - Description: Handlers use `req.payload!` and rely on TS typing; router only checks envelope is an object. Cross‑origin parent could send malformed payloads.
  - Evidence: sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts:22, :68, :95
  - Recommendation: Add per‑type runtime guards for critical fields (account IDs, arrays of actions, etc.) and return typed `ERROR` when invalid.

- P2: Cancellation path covers UI + background flows (good)
  - Evidence: sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:261–282
  - Recommendation: None.

---
