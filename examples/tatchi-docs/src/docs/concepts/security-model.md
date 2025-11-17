---
title: Security Model
---

# Security Model

The wallet protects your users' keys through multiple layers of defense. This page explains each security layer, why it matters, and how it works in practice.

You don't need to be a security expert to understand this. Our goal is to give you enough intuition to make confident integration decisions.

## The six security layers

The wallet's security model rests on six foundations:

1. **Origin isolation** - Keep secrets separate from your app
2. **Workers for secrets** - Never expose keys to the main thread
3. **Content Security Policy (CSP)** - Block injection attacks
4. **Permissions Policy** - Control WebAuthn access explicitly
5. **User presence guarantees** - Make approval steps visible and clear
6. **Credential scope** - Choose the right passkey boundaries

Each layer answers three questions: **Why do we need this? What is it? How does it work here?**

---

## 1. Origin isolation

Your app can be compromised in many ways: XSS attacks, malicious dependencies, misconfigured CSP, or supply chain attacks. If the wallet ran on the same origin as your app, any of these compromises could:

- Read the wallet's DOM and JavaScript state
- Access its IndexedDB storage
- Steal encrypted keys and credentials

This would defeat all other security measures.

The wallet runs at its own dedicated origin (like `https://wallet.example.com`) inside an iframe. This origin owns all long-lived secrets:

- WebAuthn PRF outputs
- Encrypted key blobs
- VRF keys
- User credentials

Your app never directly accesses the wallet's storage. Instead, it sends typed messages and receives structured responses.

When you configure the SDK, it mounts a hidden iframe from the wallet origin. Think of this as a secure vault embedded in your page:

```tsx
<PasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.example.com',
      walletServicePath: '/wallet-service',
    },
  }}
>
  <App />
</PasskeyProvider>
```

Your app code can *ask* the wallet to sign something, but it cannot silently extract keys. Even if an attacker injects code into your app, they're blocked by the browser's same-origin policy.

**Key takeaway:** If one origin is compromised, the other remains protected.

---

## 2. Workers for secrets

Even inside the wallet origin, we want to keep secrets away from the main thread where:

- UI code runs
- Third-party libraries execute
- Framework logic operates
- DevTools can inspect variables

All cryptographic operations run in Web Workers backed by WebAssembly. Private keys are:

- Derived from WebAuthn PRF output
- Encrypted at rest in IndexedDB
- Decrypted only into worker memory (never the main thread)

**During registration:**

1. The wallet derives key material from WebAuthn PRF output
2. It builds NEAR and VRF keypairs in a worker
3. It encrypts them with authenticated encryption (AEAD)
4. It stores only the ciphertext in IndexedDB

**During login or signing:**

1. The worker loads the encrypted blob from IndexedDB
2. It decrypts the ciphertext into its own isolated memory
3. It performs the requested cryptographic operation
4. It clears sensitive buffers immediately after use

This design minimizes the number of places where secrets ever exist in plaintext. Even with full DevTools access to the main thread, an attacker cannot see private keys.

**Key takeaway:** Secrets live in workers, never in JavaScript where they could be logged or inspected.

---

## 3. Content Security Policy (CSP)

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

**Key takeaway:** The visual layer stays flexible without punching holes in CSP.

---

## 4. Permissions Policy (WebAuthn delegation)

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

**Key takeaway:** Explicit delegation prevents WebAuthn abuse and makes the security model auditable.

---

## 5. User presence guarantees

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

For more details, see the [Wallet Iframe Architecture](/docs/concepts/wallet-iframe-architecture) guide.

---

## 6. Credential scope (rpId strategy)

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

For detailed comparisons and migration strategies, see [Credential Scope (rpId Strategy)](/docs/concepts/wallet-scoped-credentials).

---

## Security checklist summary

Before going to production, verify:

- [ ] Wallet runs on a separate origin from your app
- [ ] All cryptographic operations run in workers
- [ ] Wallet pages have strict CSP (no inline scripts/styles)
- [ ] Parent page delegates WebAuthn via Permissions-Policy
- [ ] Confirmation UI is owned by wallet origin
- [ ] `rpId` strategy is chosen and documented
- [ ] Related Origin Requests configured (if needed)
- [ ] Assets served with correct MIME types
- [ ] HTTPS enabled everywhere (required for WebAuthn)

## Next steps

- Learn about [credential scope strategies](/docs/concepts/wallet-scoped-credentials)
- Understand [VRF-backed challenges](/docs/concepts/vrf-challenges)
- Review the [wallet iframe architecture](/docs/concepts/wallet-iframe-architecture)
