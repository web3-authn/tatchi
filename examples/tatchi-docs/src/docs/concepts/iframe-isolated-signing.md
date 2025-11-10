# Iframe‑Isolated Signing

Sensitive operations (WebAuthn, PRF/VRF, key handling, signing) run inside a cross‑origin iframe so a compromised parent app cannot access credentials or keys.

## Why It Matters

- Supply‑chain/XSS in the parent app can’t read the iframe’s DOM or state
- All communication is via a typed MessageChannel RPC
- Strict headers and sandboxing limit capabilities in the service origin

## Architecture

- Cross‑origin wallet iframe running the service host
- MessageChannel RPC: only signed tx/results cross the boundary
- WASM workers inside the iframe for VRF and signing isolation
- Strict headers (COOP/COEP/CORP, Permissions‑Policy, CSP)

```ts
// Parent → request, Child → result (never exposes secrets)
await service.request('REQUEST_signTransactionsWithActions', { actions })
```

## Security Guarantees

- WebAuthn credentials, PRF output, and decrypted private keys never leave the iframe
- Only final signed results are exposed to the parent
- Biometric prompts are scoped to the iframe origin

## Dev/Deploy Notes

- Serve the wallet iframe from a hardened origin
- Apply strict headers and CSP
- Host SDK assets under a stable path with zero‑copy serving in dev

