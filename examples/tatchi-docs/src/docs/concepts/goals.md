---
title: Goals of the Wallet
---

# Goals of the Wallet

What the design optimizes for and why it exists.

- Isolation by origin
  - Private keys, WebAuthn PRF outputs, and IndexedDB storage live on a dedicated wallet origin, not in the app’s process or storage.
- Zero key exposure on main thread
  - Signing and VRF run in WASM workers inside the wallet context; secrets never touch the app frame.
- Consistent, portable credentials
  - Support wallet‑scoped and app‑scoped rpId strategies so the same passkey can serve multiple apps (or be app‑local when preferred).
- Focused confirmation UX
  - Sensitive steps render inside the wallet’s own modal to reliably capture user‑presence.
- Simple integration
  - A small config mounts the wallet iframe; typed messages connect app ↔ wallet with safe boundaries.

Read next: [Architecture Overview](/docs/concepts/wallet-iframe-architecture)

