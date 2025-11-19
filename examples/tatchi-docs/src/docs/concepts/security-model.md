---
title: Security Model
---

# Security Model

The wallet protects your users' keys through multiple layers of defense. This page covers each security layer, and how it works in practice.

The wallet's security model rests on the following:

1. **Origin isolation and credential scope** - Keep secrets separate from your app and choose the right passkey boundaries
2. **Workers for secrets** - Never expose keys to the main thread
3. **Security headers** - CSP blocks injection attacks, Permissions Policy controls WebAuthn access
4. **User presence guarantees** - Ensure TouchID approvals have user presence
5. **VRF binding in Webauthn** - Ensures against replay attacks, and ensures each transaction signing attempt is fresh with user presence.


## 1. Origin isolation & credential scope

Apps can be compromised via malicious dependencies, XSS attacks, or supply chain attacks. If the wallet ran on the same origin as your app, these compromises could:

- Read the wallet's DOM and JavaScript state
- Steal encrypted keys and credentials
- Modify functions to log sensitive data

The wallet runs at its own dedicated origin (like `https://wallet.tatchi.xyz`) inside an iframe. This origin owns all long-lived secrets:

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
      walletOrigin: 'https://wallet.tatchi.xyz',
      walletServicePath: '/wallet-service',
    },
  }}
>
  <App />
</TatchiPasskeyProvider>
```

Your app code can *ask* the wallet to sign something, but it cannot silently extract keys. If an attacker attempts to inject code into your app, they're blocked by the browser's same-origin policy.

If app origin is compromised, the wallet remains protected.

### Passkey Credential Scope (rpId strategy)

WebAuthn credentials are bound to an `rpId` - choose **wallet-scoped** (`rpId = wallet domain`) for one passkey across many apps, or **app-scoped** (`rpId = app base domain`) for credentials tied to your product's domain.

Safari's iframe restrictions require ROR configuration for wallet-scoped credentials. Once chosen, `rpId` is difficult to change without migration.

For detailed strategies, configuration examples, and migration guides, see [Passkey Scope](/docs/concepts/passkey-scope).


## 2. Workers for secrets

Even inside the isolated wallet origin, we want to keep secrets away from the main thread where:

- UI code runs
- Third-party libraries execute
- Framework logic operates
- DevTools can inspect variables

All cryptographic operations run in Web Workers on WebAssembly (WASM), where private keys are:

- Derived from WebAuthn PRF output (registration)
- Encrypted with AEAD and stored in IndexedDB
- Decrypted only in worker memory after TouchID confirmation (login/signing)
- Zeroized immediately after use

This minimizes plaintext exposure - even with DevTools access to the main thread, private keys remain invisible.


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

The SDK's Lit components comply with strict CSP by:

- Storing all styles in external CSS files under `/sdk/`
- Using `adoptedStyleSheets` (modern browsers) or `<link rel="stylesheet">` (fallback)
- Passing runtime values via CSS custom properties: `<div style="--theme-color: ${value}">`
- Never injecting inline scripts or styles

**Testing:** Set `VITE_WALLET_DEV_CSP=strict` to verify locally. For older browsers without constructable stylesheets, set `window.w3aNonce` and include the nonce in your CSP.

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

The SDK's Vite plugin automatically configures the Permissions-Policy header and iframe `allow` attribute:

```ts
import { tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

plugins: [
  tatchiBuildHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN })
]
```

**Result:** Only the wallet iframe can run WebAuthn ceremonies. Your app cannot accidentally (or maliciously) call WebAuthn directly.

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

- Learn about [passkey scope strategies](/docs/concepts/passkey-scope)
- Understand [VRF-backed challenges](/docs/concepts/vrf-webauthn)
- Review the [architecture and iframe isolation model](/docs/concepts/architecture)
