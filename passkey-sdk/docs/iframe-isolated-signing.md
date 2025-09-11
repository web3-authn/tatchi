# Iframe-Isolated Signing Architecture

## Overview

This document describes a defense-in-depth approach to protecting Web3Authn wallet operations from supply chain attacks and other client-side compromises. By isolating all sensitive operations (WebAuthn, signing, key management) in a separate cross-origin iframe, we ensure that even if the main application is compromised, the wallet's core security remains intact.

## Threat Model

### Supply Chain Attacks
Recent incidents like the [npm debug and chalk packages compromise](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised) demonstrate how malicious packages can:
- Steal credentials and private keys
- Inject malicious code into applications
- Intercept sensitive operations
- Access WebAuthn credentials and biometric data

### Our Protection Strategy
If a malicious package compromises the parent application, it should **not** be able to:
- Access WebAuthn credentials or PRF secrets
- Steal private keys (even encrypted ones)
- Intercept signing operations
- Access the wallet's internal state

## Architecture

### 1. Cross-Origin WalletIframe

All sensitive operations run in a separate iframe with its own origin:

```typescript
// Parent application creates hidden service iframe
const iframe = document.createElement('iframe');
iframe.style.position = 'fixed';
iframe.style.width = '0px';
iframe.style.height = '0px';
iframe.style.opacity = '0';
iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
```

**Key Benefits:**
- **Origin Isolation**: Parent cannot access iframe's DOM, variables, or functions
- **Controlled Communication**: Only via MessageChannel RPC
- **Sandboxed Execution**: Restricted permissions prevent dangerous operations

### 2. MessageChannel RPC Protocol

Communication between parent and iframe uses a typed RPC system:

```typescript
// Parent sends request
const response = await serviceClient.request('REQUEST_signTransactionsWithActions', {
  nearAccountId: 'user.near',
  actions: [/* transaction actions */]
});

// Iframe processes and returns only signed transaction
// Never exposes: credentials, private keys, PRF secrets
```

**Controlled API Surface:**
- `REQUEST_signTransactionsWithActions` → Returns signed transactions only
- `REQUEST_registerPasskey` → Returns registration results only
- `REQUEST_signNep413Message` → Returns signed messages only
- Database operations return only necessary data

### 3. Secure Asset Delivery

The service iframe loads from a hardened origin with strict security headers:

```typescript
// vite-secure example configuration
headers: {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'publickey-credentials-get=(self), publickey-credentials-create=(self)'
}
```

**Security Measures:**
- **Zero-copy serving**: SDK assets served directly from workspace
- **Strict CSP**: Prevents unauthorized script execution
- **WebAuthn permissions**: Controlled access to biometric APIs
- **WASM isolation**: VRF operations in isolated workers

### 4. Input Sanitization

All inputs are sanitized to prevent injection attacks:

```typescript
// Path sanitization prevents traversal attacks
export function sanitizeSdkBasePath(path: string): string {
  // Remove HTML/JS special characters
  p = p.replace(/[<>"']/g, '');

  // Remove protocol injection
  p = p.replace(/^\s*javascript:/i, '');

  // Remove path traversal
  p = p.replace(/\.\./g, '');

  return p;
}
```

## Security Guarantees

### What's Protected
- **WebAuthn Credentials**: Locked in iframe origin, never exposed to parent
- **Private Keys**: Encrypted and only decrypted within iframe
- **PRF Secrets**: Generated and used only in isolated environment
- **Signing Operations**: Happen in WASM workers within iframe
- **Biometric Data**: TouchID/FaceID prompts isolated to iframe

### What's Exposed
- **Signed Transactions**: Only the final signed result
- **Registration Status**: Success/failure and account IDs
- **User Preferences**: Non-sensitive configuration data
- **Public Keys**: Only when necessary for verification

## Implementation Details

### WalletIframe Bootstrap

The iframe loads a minimal HTML page that imports the service host:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Web3Authn Wallet Service</title>
  </head>
  <body>
    <script type="module" src="/sdk/esm/react/embedded/wallet-iframe-host.js"></script>
  </body>
</html>
```

### RPC Message Types

```typescript
// Parent to Child (requests)
type ParentToChildEnvelope =
  | RpcEnvelope<'REQUEST_signTransactionsWithActions', RequestSignPayload>
  | RpcEnvelope<'REQUEST_registerPasskey', RequestRegisterPayload>
  | RpcEnvelope<'REQUEST_signNep413Message', unknown>
  // ... other operations

// Child to Parent (responses)
type ChildToParentEnvelope =
  | RpcEnvelope<'SIGN_RESULT', { success: boolean; signedTransactions: SignedTransaction[] }>
  | RpcEnvelope<'REGISTER_RESULT', { success: boolean; accountId: string }>
  // ... other results
```

### WASM Worker Isolation

Critical operations run in isolated Web Workers with WASM:

```typescript
// VRF operations in isolated worker
const vrfWorker = new Worker('/sdk/workers/web3authn-vrf.worker.js');
const signerWorker = new Worker('/sdk/workers/web3authn-signer.worker.js');
```

## Attack Scenarios

### Scenario 1: Malicious npm Package
**Attack**: Malicious package in parent app tries to steal credentials
**Defense**: Credentials are locked in iframe origin, inaccessible to parent
**Result**: Attacker can only see signed transactions, not raw credentials

### Scenario 2: XSS in Parent App
**Attack**: Cross-site scripting in main application
**Defense**: Iframe runs in separate origin with strict CSP
**Result**: XSS cannot access iframe's security context

### Scenario 3: Compromised CDN
**Attack**: Malicious assets served from CDN
**Defense**: Assets served from workspace with integrity checks
**Result**: Compromised CDN cannot inject code into iframe

## Development Setup

### Local Development
```bash
# Build SDK
pnpm -C passkey-sdk dev

# Start secure dev server
pnpm -C examples/vite-secure dev

# Access wallet service
open https://wallet.example.localhost/wallet-service
```

### Production Deployment
1. Serve SDK assets from your own domain
2. Configure CORS and CSP headers
3. Use HTTPS for all origins
4. Implement integrity checks for assets
