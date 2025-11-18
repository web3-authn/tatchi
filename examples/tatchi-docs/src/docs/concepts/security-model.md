---
title: Security Model
---

# Security Model

The wallet protects your users' keys through multiple layers of defense. This page covers each security layer, and how it works in practice.

The wallet's security model rests on four foundations:

1. **Origin isolation & credential scope** - Keep secrets separate from your app and choose the right passkey boundaries
2. **Workers for secrets** - Never expose keys to the main thread
3. **Security headers** - CSP blocks injection attacks, Permissions Policy controls WebAuthn access
4. **User presence guarantees** - Ensure TouchID approvals have user presence
5. **VRF binding in Webauthn** - Ensures against replay attacks, and ensures each transaction signing attempt is fresh with user presence. VRF binds current onchain state and uses it as Webauthn challenges for additional security.


## 1. Origin isolation & credential scope

Apps can be compromised via malicious dependencies, XSS attacks, or supply chain attacks. If the wallet ran on the same origin as your app, these compromises could:

- Read the wallet's DOM and JavaScript state
- Steal encrypted keys and credentials
- Modify functions to log sensitive data

The wallet runs at its own dedicated origin (like `https://wallet.example.com`) inside an iframe. This origin owns all long-lived secrets:

- WebAuthn PRF outputs
- Encrypted key blobs
- VRF keys
- User credentials

Your app never directly accesses the wallet's storage. Instead, it sends typed messages and receives structured responses.

When you configure the SDK, it mounts a hidden iframe from the wallet origin. Think of this as a secure vault embedded in your page:

```tsx
<TatchiPasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.example.com',
      walletServicePath: '/wallet-service',
    },
  }}
>
  <App />
</TatchiPasskeyProvider>
```

Your app code can *ask* the wallet to sign something, but it cannot silently extract keys. If an attacker attempts to inject code into your app, they're blocked by the browser's same-origin policy.

If app origin is compromised, the wallet remains protected.

### Credential scope (rpId strategy)

WebAuthn credentials are bound to an `rpId` (a registrable domain like `example.com`). Choose the wrong scope and:

- Credentials become invisible to your users
- You cannot reuse passkeys across apps
- Migration later requires complex key rotation

The SDK supports two strategies:

**Wallet-scoped credentials:**

- `rpId` is the wallet domain (e.g., `wallet.example.com`)
- One passkey can serve many apps
- Good for shared wallet services

**App-scoped credentials:**

- `rpId` is your app's base domain (e.g., `example.com`)
- Credentials belong to your product
- Good for single-product deployments

You choose the strategy in your SDK configuration:

```tsx
<PasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.example.com',
      // Option 1: Wallet-scoped (one passkey, many apps)
      rpIdOverride: 'wallet.example.com',

      // Option 2: App-scoped (credentials belong to your domain)
      // rpIdOverride: 'example.com',
    }
  }}
>
```

**For cross-origin scenarios:**

In Safari, WebAuthn in iframes often fails. The SDK includes a top-level bridge that works around this. When the `rpId` differs from the top-level origin, you must configure Related Origin Requests (ROR) by serving `/.well-known/webauthn` on the wallet domain:

```json
{
  "origins": [
    "https://app.example.com",
    "https://another-app.example.com"
  ]
}
```

**Key takeaway:** Choose your `rpId` strategy carefully before production—it's hard to change later.

For detailed comparisons and migration strategies, see [Credential Scope (rpId Strategy)](/docs/concepts/credential-scope-rpid).


## 2. Workers for secrets

Even inside the isolated wallet origin, we want to keep secrets away from the main thread where:

- UI code runs
- Third-party libraries execute
- Framework logic operates
- DevTools can inspect variables

All cryptographic operations are therefore run in Web Workers running on WebAssembly (WASM). In these WASM workers, private keys are:

- Derived from WebAuthn PRF output
- Encrypted at rest in IndexedDB
- Decrypted only in worker memory, and zeroized automatically

**During registration:**

1. The wallet derives key material from WebAuthn PRF output
2. ...builds NEAR and VRF keypairs in a worker
3. ...encrypts them with authenticated encryption (AEAD)
4. ...stores only the ciphertext in IndexedDB

**During login or signing:**

1. The worker loads the encrypted blob from IndexedDB
2. The worker requires TouchID confirmation from the user
2. ...decrypts the ciphertext into its own isolated memory
3. ...performs the requested cryptographic operation
4. ...clears sensitive buffers immediately after use

This design minimizes the number of places where secrets ever exist in plaintext. Even with full DevTools access to the main thread, an attacker cannot see private keys.


## 3. Security headers

The wallet uses HTTP security headers to control code execution and API access. Two policies work together to prevent injection attacks and enforce WebAuthn boundaries.

### Content Security Policy (CSP)

Inline `<script>` and `<style>` blocks are easy attack vectors:

- Hard to audit
- Easy to inject via XSS
- Difficult to distinguish malicious from legitimate code

A strict CSP makes these attacks much harder by blocking inline code execution and controlling where scripts can load from.

The wallet pages use a strict Content Security Policy. For example:

```text
script-src 'self';
style-src 'self';
style-src-attr 'none';
```

This policy:

- Blocks all inline scripts
- Blocks inline styles
- Allows only scripts and styles from the same origin

The SDK's Lit components are designed to work under this policy. They never use:

- Inline `<script>` tags
- Inline `<style>` tags
- `element.style = ...` assignments
- Runtime style injection

**Static styles:**

All component styles live in external CSS files under `/sdk/`:

- `tx-tree.css`
- `tx-confirmer.css`
- `drawer.css`
- `halo-border.css`
- `passkey-halo-loading.css`

**Component loading:**

Components use an internal helper that:

1. Attaches stylesheets via `adoptedStyleSheets` (modern browsers)
2. Falls back to `<link rel="stylesheet">` when needed
3. Never injects inline styles

**Dynamic values:**

Runtime values (colors, geometry, theme tokens) are passed via CSS custom properties:

```ts
// ✗ Forbidden - inline style manipulation
element.style.setProperty('--theme-color', value)
```

```html
<!-- ✓ Allowed - CSS variables in templates -->
<div style="--theme-color: ${value}">
```

**Development and testing:**

- **Dev mode:** Set `VITE_WALLET_DEV_CSP=strict` to test the real policy locally
- **CI tests:** Playwright asserts that wallet routes have strict CSP and no inline styles
- **Build checks:** Verify all required CSS files are present in the bundle

**Fallback for older browsers:**

If you need to support browsers without constructable stylesheets:

1. Set `window.w3aNonce` or `window.litNonce` to a random nonce
2. Include that nonce in your CSP: `style-src 'nonce-abc123'`
3. Components will inject a nonce-bearing `<style>` tag

### Permissions Policy (WebAuthn delegation)

Browsers restrict WebAuthn access per origin. In a multi-origin setup (your app + wallet iframe), you must explicitly grant the wallet permission to call WebAuthn APIs.

Without this, WebAuthn calls from the iframe would fail with permission errors.

The parent page sends a `Permissions-Policy` header that delegates WebAuthn capabilities to the wallet origin:

```text
Permissions-Policy:
  publickey-credentials-get=(self "https://wallet.example.com"),
  publickey-credentials-create=(self "https://wallet.example.com")
```

The iframe is created with matching `allow` attributes:

```html
<iframe allow="publickey-credentials-get; publickey-credentials-create" ...>
```

**Your server setup:**

Your server (or CDN) sends the Permissions-Policy header on pages that embed the wallet. If you're using the SDK's Vite plugin, this is handled automatically:

```ts
import { tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

plugins: [
  tatchiBuildHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN })
]
```

**The SDK's iframe:**

The SDK automatically sets the iframe's `allow` attribute to match the policy you configured.

**Result:**

Only the wallet iframe can run WebAuthn ceremonies, even when embedded in different hosts. Your app cannot accidentally (or maliciously) call WebAuthn directly.

**Key takeaway:** CSP blocks injection attacks while Permissions Policy enforces WebAuthn boundaries. Both policies make the security model auditable and enforceable at the HTTP layer.


## 4. User presence guarantees

Users should clearly see when they're approving sensitive actions like:

- Registering a passkey
- Signing a blockchain transaction
- Authorizing a fund transfer

If confirmation dialogs are mixed into arbitrary host UIs, phishing becomes trivially easy. An attacker could create a fake "confirm" button that looks like your app but steals approvals.

The wallet owns the final confirmation UI. Your app can:

- Trigger flows
- Display progress indicators
- Show transaction previews

But the *real* confirm button lives inside the wallet origin, where your app cannot manipulate it.

During flows that require user presence:

1. The wallet opens its own modal inside the iframe
2. The overlay stays visible during `STEP_2_USER_CONFIRMATION`
3. The wallet waits for a click inside its own origin
4. Only then does it proceed with the sensitive operation

Your app receives progress events but cannot bypass or fake the confirmation:

```ts
passkeyManager.signTransaction(tx, {
  onProgress: (step) => {
    if (step === 'STEP_2_USER_CONFIRMATION') {
      console.log('Waiting for user to click Confirm in wallet UI')
      // You cannot programmatically skip this step
    }
  }
})
```

**Key takeaway:** Confirmation happens in a context your app cannot spoof.

For more details, see the [Architecture](/docs/concepts/architecture) guide.

## 5. VRF binding WebAuthn

Web3Authn uses a verifiable random function (VRF) to bind each WebAuthn ceremony to the current on‑chain state. This prevents an attacker from replaying an old approval in a different context or at a different block height.

During a VRF‑backed flow, the wallet’s WASM worker:

1. Builds a VRF input that includes the wallet origin (rpId), user identifier, and NEAR block data (height and hash)
2. Uses the account’s VRF private key (kept only in WASM memory) to compute a VRF output and proof
3. Derives a WebAuthn challenge from this VRF output and asks the user for a fresh TouchID/biometric approval
4. Sends the VRF proof and public key to the Web3Authn contract, which re‑computes the input and verifies that the proof matches the current chain state

The VRF construction gives three important properties:

- **Freshness** – block height/hash and rpId tie the challenge to the specific chain state and origin the user saw
- **Verifiability** – the contract can independently verify that the worker used the correct VRF key and inputs
- **Non‑exportability** – the VRF private key never leaves the WASM worker, so app code cannot forge outputs

Combined with WebAuthn’s user‑presence requirement, this means each signing attempt is both user‑approved and bound to the exact on‑chain state it targets, closing replay and cross‑origin phishing gaps.


## Next steps

- Learn about [credential scope strategies](/docs/concepts/credential-scope-rpid)
- Understand [VRF-backed challenges](/docs/concepts/vrf-webauthn)
- Review the [architecture and iframe isolation model](/docs/concepts/architecture)
