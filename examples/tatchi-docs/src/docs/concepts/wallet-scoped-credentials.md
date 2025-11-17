---
title: Credential Scope (rpId Strategy)
---

# Credential Scope (rpId Strategy)

Every WebAuthn credential is bound to a **relying party ID (rpId)**. This single configuration choice determines:

- Which sites can see the passkey
- Whether passkeys work across subdomains
- Whether one passkey can serve multiple apps

Choose carefully—changing `rpId` later requires migrating all existing credentials.

## What is rpId?

The `rpId` is a registrable domain name without scheme or port. Examples:

- `example.com` (covers all `*.example.com` subdomains)
- `wallet.example.com` (covers only this specific subdomain)
- `web3authn.org` (different domain entirely)

The browser checks that WebAuthn calls come from a page whose origin matches the `rpId`. If they don't match, the call fails.

## The two strategies

The SDK supports two main patterns:

### 1. Wallet-scoped credentials

**`rpId = <wallet domain>`**

One wallet credential can be reused across many apps that embed that wallet.

Example: `rpId = "wallet.example.com"`

**When to choose this:**

- You run a shared wallet service across many apps
- Users should see one "Tatchi wallet" passkey in their browser
- You want a clear trust boundary: "trust the wallet origin"

### 2. App-scoped credentials

**`rpId = <app base domain>`**

Credentials belong to your product's domain and work across its subdomains.

Example: `rpId = "example.com"`

**When to choose this:**

- Your app and wallet share a base domain
- You want credentials to feel like "this product's passkeys"
- You prefer traditional WebAuthn where `rpId` matches the app domain

Both strategies are secure. The difference is *reusability* and *browser compatibility*.

---

## Option A: Wallet-scoped credentials

### The setup

Use the wallet domain as `rpId`:

```tsx
<PasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.example.com',
      rpIdOverride: 'wallet.example.com',  // ← Wallet-scoped
    }
  }}
>
```

### How it works

The wallet iframe calls WebAuthn with `rpId = "wallet.example.com"`. The browser compares:

```
claimed rpId: "wallet.example.com"
iframe origin: "wallet.example.com"
→ Match! WebAuthn allowed.
```

Any app that embeds this iframe can reuse the same credential, as long as it delegates WebAuthn via Permissions-Policy.

### Pros

- One passkey per user, reused across multiple apps
- Clear trust model: "if you trust the wallet origin, you can use this passkey"
- Good for multi-tenant wallet services

### Cons

**Safari iframe limitations:**

Safari often blocks WebAuthn in cross-origin iframes. The SDK includes a top-level bridge as a fallback:

1. The wallet detects the iframe error
2. It asks the parent page to call WebAuthn instead
3. The parent calls WebAuthn with `rpId = "wallet.example.com"`

But when the top-level origin differs from `rpId`, you must configure **Related Origin Requests (ROR)**.

**Related Origin Requests (ROR):**

The wallet domain must serve `/.well-known/webauthn` listing allowed top-level origins:

```json
{
  "origins": [
    "https://app.example.com",
    "https://another-app.example.com"
  ]
}
```

This tells the browser: "It's okay for these origins to use credentials with my `rpId`."

**Browser support:**

- Chrome/Edge: Full support
- Safari: Requires ROR for top-level bridge
- Firefox: Limited ROR support (may need fallback)

### Configuration example

**1. Set rpId in SDK config:**

```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.example.com',
  rpIdOverride: 'wallet.example.com',
}
```

**2. Serve ROR manifest at wallet origin:**

```
https://wallet.example.com/.well-known/webauthn
```

```json
{
  "origins": [
    "https://app.example.com",
    "https://another-app.example.com"
  ]
}
```

**3. Delegate WebAuthn in parent page:**

```text
Permissions-Policy:
  publickey-credentials-get=(self "https://wallet.example.com"),
  publickey-credentials-create=(self "https://wallet.example.com")
```

The SDK's Vite plugin can generate this header automatically:

```ts
import { tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

plugins: [
  tatchiBuildHeaders({ walletOrigin: 'https://wallet.example.com' })
]
```

### When you DON'T need ROR

If WebAuthn runs **inside the iframe** (not using the top-level bridge), you don't need ROR. The browser checks:

```
claimed rpId: "wallet.example.com"
iframe origin: "wallet.example.com"
→ Match! No ROR needed.
```

You only need ROR when:

- A **top-level page** calls WebAuthn, and
- The top-level origin is **different** from the `rpId`

This primarily supports Safari's top-level bridge mode.

### Shared wallet across unrelated domains

When the iframe calls WebAuthn directly:

- `https://app1.com` embeds wallet iframe → reuses credential
- `https://app2.com` embeds wallet iframe → reuses credential
- `https://totally-different.org` embeds wallet iframe → reuses credential

No allowlist needed! Any site can embed the wallet. Security relies on:

- The wallet's origin isolation
- The wallet's internal checks (verifying `clientDataJSON.origin`)
- The smart contract's verification

**Key takeaway:** Wallet-scoped gives maximum reusability but requires careful ROR configuration for Safari.

---

## Option B: App-scoped credentials

### The setup

Use your app's base domain as `rpId`:

```tsx
<PasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.example.com',
      rpIdOverride: 'example.com',  // ← App-scoped
    }
  }}
>
```

### How it works

Both your app and wallet are under `example.com`:

- App: `https://app.example.com`
- Wallet: `https://wallet.example.com`

The browser checks:

```
claimed rpId: "example.com"
iframe origin: "wallet.example.com"
→ "wallet.example.com" is under "example.com" → allowed
```

Credentials work across all `*.example.com` subdomains.

### Pros

- Works naturally across your product's subdomains
- Safari's top-level bridge matches the top-level origin (often no ROR needed)
- Traditional WebAuthn model—familiar to security teams

### Cons

- Each product/domain needs its own credential
- Cannot reuse passkeys across unrelated domains (e.g., `example.com` vs `web3authn.org`)
- If you switch to a different base domain later, old credentials won't appear

### Configuration example

**1. Set rpId to app base domain:**

```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.example.localhost',
  rpIdOverride: 'example.localhost',  // App base domain
}
```

**2. Enable Safari fallback:**

Keep the top-level bridge enabled (it's on by default). The SDK will use it automatically when iframe WebAuthn fails.

**3. Delegate WebAuthn:**

```text
Permissions-Policy:
  publickey-credentials-get=(self "https://wallet.example.localhost"),
  publickey-credentials-create=(self "https://wallet.example.localhost")
```

**Key takeaway:** App-scoped gives predictable subdomain behavior with minimal Safari complexity.

---

## Choosing your strategy

Ask yourself:

### Do you want one credential across many apps?

→ Choose **wallet-scoped** (`rpId = wallet domain`)

- Prepare ROR configuration for Safari
- Test across Chrome, Safari, Firefox
- Document allowed origins in `/.well-known/webauthn`

### Do you want credentials tied to your product?

→ Choose **app-scoped** (`rpId = app base domain`)

- Ensure app and wallet share a base domain
- Simpler Safari integration (often no ROR needed)
- Traditional WebAuthn security model

### Is this a multi-tenant wallet service?

→ Choose **wallet-scoped**

- Users see one wallet passkey across all your customers' apps
- Requires careful origin allowlisting and ROR maintenance

### Is this a single-product deployment?

→ Choose **app-scoped**

- Credentials belong to your brand
- Easier to explain to security auditors
- Less cross-origin complexity

---

## Build-time vs runtime configuration

### Build-time (recommended)

Set `rpIdOverride` in your production config and commit it:

```tsx
// config/production.ts
export const config = {
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    rpIdOverride: 'example.com',  // Locked in
  }
}
```

This is simplest and avoids surprises.

### Runtime (for testing)

In staging, you can toggle between strategies:

```tsx
const rpId = searchParams.get('rpId') || 'wallet.example.com'

<PasskeyProvider config={{
  iframeWallet: { rpIdOverride: rpId }
}}>
```

**Warning:** Credentials are bound to `rpId`. If you change it, previously registered passkeys won't appear for the new value.

**Key takeaway:** Treat `rpId` as a long-term contract once you're in production.

---

## Migrating wallet origins

Sometimes you need to move the wallet host while keeping the same `rpId`.

Example: Moving from `https://web3authn.org` to `https://wallet.tatchi.xyz`.

### Strategy: Keep rpId stable, change host

**1. Keep `rpIdOverride` unchanged:**

```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.tatchi.xyz',  // New host
  rpIdOverride: 'web3authn.org',              // Old rpId (stable)
}
```

**2. Update ROR manifest on the rpId domain:**

Serve `https://web3authn.org/.well-known/webauthn`:

```json
{
  "origins": [
    "https://wallet.tatchi.xyz",      // New wallet host
    "https://app.example.com",        // Your app
    "https://another-app.example.com" // Other apps
  ]
}
```

**3. Delegate WebAuthn to both hosts during transition:**

```text
Permissions-Policy:
  publickey-credentials-get=(
    self
    "https://web3authn.org"
    "https://wallet.tatchi.xyz"
  )
```

**4. Gradually migrate traffic to the new host**

Because credentials are bound to `rpId` (not the iframe host), this preserves discoverability while you move traffic.

**Key takeaway:** You can change the wallet host without losing credentials if you keep `rpId` stable and configure ROR correctly.

---

## Testing your strategy

Before production, test in all target browsers:

### Chrome

```bash
# Wallet-scoped
✓ Iframe WebAuthn works
✓ Top-level bridge works with ROR

# App-scoped
✓ Iframe WebAuthn works across subdomains
✓ Top-level bridge works
```

### Safari

```bash
# Wallet-scoped
⚠ Iframe WebAuthn often blocked
✓ Top-level bridge works with ROR
⚠ Check ROR manifest is served correctly

# App-scoped
⚠ Iframe WebAuthn often blocked
✓ Top-level bridge works (usually no ROR needed)
```

### Firefox

```bash
# Wallet-scoped
✓ Iframe WebAuthn works
⚠ Limited ROR support (may need fallback)

# App-scoped
✓ Iframe WebAuthn works
✓ Top-level bridge works
```

### Developer tools checks

**1. Check ROR manifest:**

```bash
curl https://wallet.example.com/.well-known/webauthn
```

Should return valid JSON with your allowed origins.

**2. Check Permissions-Policy:**

Open DevTools → Network → Select your page → Check response headers:

```
Permissions-Policy: publickey-credentials-get=(self "https://wallet.example.com")
```

**3. Check iframe attributes:**

Inspect the wallet iframe element:

```html
<iframe
  allow="publickey-credentials-get; publickey-credentials-create"
  src="https://wallet.example.com/wallet-service"
>
```

**4. Test credential discoverability:**

Open your browser's password manager:

- Chrome: Settings → Passwords → Passkeys
- Safari: Settings → Passwords → Passkeys
- Firefox: Settings → Privacy & Security → Saved Logins

Verify the passkey appears with the expected `rpId`.

---

## Common issues and fixes

### "WebAuthn not available" in iframe

**Cause:** Permissions-Policy not set or iframe `allow` attribute missing.

**Fix:**

1. Add header: `Permissions-Policy: publickey-credentials-get=(self "https://wallet.example.com")`
2. Ensure iframe has: `allow="publickey-credentials-get; publickey-credentials-create"`
3. Check the SDK's Vite plugin is enabled

### Passkey not appearing in Safari

**Cause:** ROR manifest missing or incorrect.

**Fix:**

1. Serve `/.well-known/webauthn` on the `rpId` domain
2. Include all top-level origins in the `origins` array
3. Verify with: `curl https://<rpId>/.well-known/webauthn`
4. Clear Safari's passkey cache: Settings → Passwords → Remove test passkeys

### Passkey works locally but not in production

**Cause:** Mismatched `rpId` configuration or HTTPS issues.

**Fix:**

1. Verify `rpIdOverride` is set correctly in production config
2. Ensure all origins use HTTPS (WebAuthn requires secure context)
3. Check production ROR manifest matches local configuration
4. Verify Permissions-Policy header is sent in production

### Cannot reuse passkey across apps

**Cause:** Wrong `rpId` strategy or ROR not configured.

**Fix:**

- For wallet-scoped: Ensure ROR manifest includes all app origins
- For app-scoped: Apps must share the same base domain
- Verify `rpIdOverride` is consistent across all apps

---

## Summary

When designing your deployment:

1. **Do you want one credential across many apps?**
   - Wallet-scoped `rpId`
   - Configure ROR for Safari
   - Test cross-origin scenarios

2. **Do you want credentials tied to your product?**
   - App-scoped `rpId`
   - Simpler Safari integration
   - Works across subdomains

3. **What's your browser support matrix?**
   - Chrome: Both strategies work well
   - Safari: Prepare ROR for wallet-scoped
   - Firefox: Limited ROR support

Once you choose an `rpId` and register passkeys, changing it later is a migration project, not a configuration toggle.

**Choose carefully, test thoroughly, document clearly.**

## Next steps

- Learn about [VRF-backed challenges](/docs/concepts/vrf-challenges)
- Understand the [wallet iframe architecture](/docs/concepts/wallet-iframe-architecture)
- Review the [security model](/docs/concepts/security-model)
