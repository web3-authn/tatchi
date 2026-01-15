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
5. **VRF binding in WebAuthn** - Ensures against replay attacks, and ensures each transaction signing attempt is fresh with user presence.

This design makes an explicit tradeoff:

- **Default mode:** best UX, low friction, embedded wallet (no extension install required; no popups), and **self-custody** (secrets never leave the device; relayers are optional and non-custodial).
- **Cost:** you still depend on the integrity of the wallet runtime environment (wallet-origin code + the user’s browser/OS).
- **Progressive hardening:** users who want stronger protection against hostile browser extensions can opt into an extension-based wallet runtime (see `docs/chrome-extension-upgrade.md`).

## Threat model (what this protects vs what it doesn’t)

**This model is designed to protect against:**

- A compromised **app origin** (XSS, malicious npm deps, compromised app hosting) — wallet secrets stay in the wallet origin and in workers.
- Network attackers who can observe traffic but cannot break TLS — secrets are never transmitted; contract verification provides cryptographic checks.
- Accidental exposure in app code — APIs and guardrails avoid putting PRF/keys into app-visible payloads.

**This model is not designed to fully protect against:**

- **Wallet-origin code execution** (e.g., hostile browser extensions that can run on the wallet origin, or a compromised wallet-origin deployment/supply chain).
- **Endpoint compromise** (malware, browser 0-days, OS-level compromise).
- **User-consented malicious actions** (phishing / deceptive transaction intent) — mitigated by strong confirmation UX, but still a real risk.

If wallet-origin code execution is in-scope for your deployment, consider the optional extension upgrade path to reduce the “hostile extension injecting into `https://wallet.…`” class of risk, at the cost of an extra installation/migration step.

## 1. Origin isolation & credential scope

Apps can be compromised via malicious dependencies, XSS attacks, or supply chain attacks. If the wallet ran on the same origin as your app, these compromises could:

- Read the wallet's DOM and JavaScript state
- Steal encrypted keys and credentials
- Modify functions to log sensitive data

The wallet runs at its own dedicated origin (like `https://wallet.web3authn.org`) inside an iframe. This origin owns all long-lived secrets:

- Encrypted vault blobs (`C_near`, `wrapKeySalt`) and authenticator metadata (IndexedDB)
- Encrypted VRF keypair material (at rest) and VRF session state (in VRF worker memory while unlocked)
- WebAuthn ceremony + PRF evaluation (outputs are ephemeral and never returned to the embedding app)
- User/session metadata used to route signing and confirmations

Your app never directly accesses the wallet's storage. Instead, it sends typed messages and receives structured responses.

When you configure the SDK, it mounts a hidden iframe from the wallet origin. Think of this as a secure vault embedded in your page:

```tsx
<TatchiPasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.web3authn.org',
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

Even inside the isolated wallet origin, we minimize what the UI main thread ever holds, where:

- UI code runs
- Third-party libraries execute
- Framework logic operates
- DevTools can inspect variables

All cryptographic operations that touch key‑unwrapping power run in Web Workers (WASM):

- **VRF worker (stateful, long‑lived)** – coordinates WebAuthn confirmation, verifies VRF/WebAuthn freshness (optionally via contract RPC), reconstructs/unlocks the VRF keypair (`vrf_sk`) and derives `WrapKeySeed`. It can cache short‑lived *VRF sessions* (TTL + remaining uses) and dispense session keys to signers.
- **Signer worker (one‑shot, pooled)** – receives only `WrapKeySeed + wrapKeySalt` over a dedicated `MessagePort`, derives the KEK, decrypts `near_sk`, signs, and then terminates (a new worker is used for the next request).
- **1 VRF worker → N signer workers** – a single VRF worker can serve many disposable signer workers over time. Each signing attempt uses a fresh `MessageChannel` for worker‑to‑worker secret transfer.

Your app never receives `PRF.*`, `vrf_sk`, `WrapKeySeed`, or `near_sk`. `WrapKeySeed + wrapKeySalt` (and, for flows that require it, `PRF.second`) move worker‑to‑worker over a `MessagePort` — not through app JS payloads and not over the network.

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

The wallet owns the final confirmation UI from its origin. Your app can:

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
import { ActionPhase } from '@tatchi-xyz/sdk/react'

await tatchi.executeAction({
  nearAccountId: 'alice.testnet',
  receiverId: 'contract.testnet',
  actionArgs: [/* ... */],
  options: {
    onEvent: (event) => {
      if (event.phase === ActionPhase.STEP_2_USER_CONFIRMATION) {
        console.log('Waiting for user to click Confirm in wallet UI')
      }
    },
  },
})
```

**Key takeaway:** Confirmation happens in a context your app cannot spoof.

For more details, see the [Architecture](/docs/concepts/architecture) guide.

## 5. VRF binding WebAuthn

Web3Authn uses a verifiable random function (VRF) to bind each WebAuthn ceremony to the current on‑chain state, then derives the unwrapping key inside workers. This prevents replay and keeps long‑lived key material out of app‑visible JS.

During a VRF‑backed signing flow, the wallet:

1. Fetches fresh chain context (block height/hash) and asks the VRF worker to mint a VRF challenge (output + proof) bound to that state.
2. Runs WebAuthn using the VRF output as the challenge (user presence) and requests PRF evaluation (`PRF.first_auth`, and optionally `PRF.second` for specific flows).
3. Optionally gates key dispensing by calling the Web3Authn contract to verify the VRF proof + WebAuthn signature before deriving/dispensing any unwrapping material.
4. Derives `WrapKeySeed` from **two factors**: fresh `PRF.first_auth` and the in‑memory VRF secret key (`vrf_sk_bytes`). `WrapKeySeed + wrapKeySalt` (and `PRF.second` when needed) are delivered to the signer worker over an internal `MessagePort`.
5. Signer worker derives `KEK`, decrypts `near_sk`, signs, and terminates.

### KEK derivation (two‑factor unwrapping)

The signer’s KEK is derived from a `WrapKeySeed` that requires both:
- a fresh `PRF.first_auth` (TouchID/WebAuthn), and
- the VRF secret key bytes (`vrf_sk_bytes`) held only in the VRF worker (unlocked via the wallet’s VRF unlock flow, e.g. Shamir 3‑pass or explicit recovery).

In code this is HKDF‑SHA256 with domain separation:

```text
K_pass_auth = HKDF(PRF.first_auth, info="vrf-wrap-pass")
WrapKeySeed  = HKDF(K_pass_auth || vrf_sk_bytes, info="near-wrap-seed")
KEK          = HKDF(WrapKeySeed, salt=wrapKeySalt, info="near-kek")
```

`wrapKeySalt` comes from the encrypted vault entry (or is generated once during vault creation/upgrade). It is not derived from `vrf_sk`.

### VRF sessions (1 VRF : N signers)

After a successful confirmation, the VRF worker can cache `{WrapKeySeed, wrapKeySalt}` under a `sessionId` with a TTL and remaining‑uses budget. Subsequent signing requests can reuse that session without a new WebAuthn prompt by calling a “dispense session key” operation in the VRF worker, which sends the same `{WrapKeySeed, wrapKeySalt}` to a fresh signer worker over a new `MessageChannel`.

See [VRF Sessions](/docs/concepts/vrf-sessions) for the detailed handshake flow.

The VRF construction gives three important properties:

- **Freshness** – block height/hash tie the challenge to the specific chain state the user saw
- **Verifiability** – the contract independently verifies the VRF proof and WebAuthn signature together
- **Non‑exportability** – `vrf_sk` stays VRF‑worker‑only; `WrapKeySeed` is only ever transferred VRF‑worker → signer‑worker over a `MessagePort`, and PRF extension outputs are never forwarded to RPC or returned to the embedding app

Combined with WebAuthn’s user‑presence requirement, this means each signing attempt is user‑approved, freshness‑bound, and compartmentalized across workers.

**Primary vs backup**
- **Primary:** Shamir 3-pass (relay + device) runs on every session unlock for 2-of-2 security.
- **Backup:** PRF.second-based recovery is available for registration, device linking, and explicit Recovery Mode; it is zeroized immediately and not used for routine signing.


## Next steps

- Learn about [passkey scope strategies](/docs/concepts/passkey-scope)
- Understand [VRF-backed challenges](/docs/concepts/vrf-webauthn)
- Review the [architecture and iframe isolation model](/docs/concepts/architecture)
