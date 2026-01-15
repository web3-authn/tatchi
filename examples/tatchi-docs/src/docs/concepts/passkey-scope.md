---
title: Passkey Scope and Composability
---

# Passkey Scope and Composability

Every Passkey WebAuthn credential is bound to a **relying party ID (rpId)**, a domain that determines which sites can access the passkey and whether it works across subdomains.

Tatchi wallets use the WebAuthn **PRF extension** on every flow: `PRF.first` gates sessions (with Shamir 3-pass as primary) and `PRF.second` is reserved for registration, device linking, or explicit recovery. Whichever rpId strategy you choose must remain stable so these PRF outputs stay discoverable.

The SDK supports two strategies:

**Option A: Wallet-scoped (`rpId = wallet domain`)** - One passkey reused across many apps. The wallet and app origins differ (e.g., app at `app.example.com` embedding wallet at `web3authn.org` with `rpId = "web3authn.org"`). This is the default mode, as it requires less setup.

**Option B: App-scoped (`rpId = app base domain`)** - Credentials bound to your product's domain, working across subdomains. The app and wallet share a base domain (e.g., wallet at `wallet.example.com`, app at `app.example.com`, with `rpId = "example.com"`). Choose this for single-product deployments. This requires contract deployment and configuration.

Both are secure. The key difference is passkey composability across apps on different domains (wallet-scoped) vs traditional domain binding (app-scoped).

### Choosing your strategy

**Wallet-scoped** (`rpId = wallet domain`) - Choose when you want one passkey reused across many apps on different domains. Requires ROR configuration for Safari. Ideal for multi-tenant wallet services.

**App-scoped** (`rpId = app base domain`) - Choose when credentials should be tied to your product's domain. Simpler Safari integration, no ROR needed. Ideal for single-product deployments where the app and wallet share a base domain.


## Option A: Wallet-scoped credentials

Use the wallet domain as `rpId`:
```tsx
<PasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.web3authn.org',
      rpIdOverride: 'wallet.web3authn.org',  // ← Wallet-scoped
    }
  }}
>
```
The app's embedded wallet iframe calls WebAuthn with `rpId = "wallet.web3authn.org"`.

Any app that embeds this iframe can reuse the same Passkey credential, as long as it delegates WebAuthn via Permissions-Policy.

### Pros and Cons

::: tip Pros
- One passkey per user, reused across multiple apps
- Clear trust model: "if you trust the wallet origin, you can use this passkey"
- Good for multi-tenant wallet services

When the iframe calls WebAuthn directly:

- `https://app1.com` embeds wallet iframe → reuses credential
- `https://app2.com` embeds wallet iframe → reuses credential
- `https://totally-different.org` embeds wallet iframe → reuses credential

No allowlist needed! Any site can embed the wallet. Security relies on:

- The wallet's origin isolation
- The wallet's internal checks (verifying `clientDataJSON.origin`)
- The smart contract's verification

**Key point:** Wallet-scoped gives maximum reusability but requires careful ROR configuration specifically for Safari.

:::

::: warning Safari limitations
- Safari blocks WebAuthn in cross-origin iframes, so the SDK falls back to requesting TouchID in the app origin causing the rpID to differ from the wallet origins.
- For Safari, this requires the app to be whitelisted (Related Origin Requests (ROR)) in the wallet domain's `/.well-known/webauthn` endpoint
```json
{
  "origins": [
    "https://wallet.tatchi.com",
    "https://web3authn.org",
    "https://example.your-app.com"
  ]
}
```

The Wallet SDK automatically looks up the Web3Authn contracts `get_allowed_origins` endpoint and returns whitelisted origins, so every wallet deployment can call `set_allowed_origins` on the onchain Web3Authn contract and be added to the whitelist (or self-deploy their own wallet contracts).
:::


## Option B: App-scoped credentials

You can use your app's base domain as `rpId` when the wallet also lives under that base domain:

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

Both your app (`https://app.example.com`) and wallet (`https://wallet.example.com`) share the same registrable suffix, and credentials work across all `*.example.com` subdomains on all browsers (including Safari).

### Pros and Cons

::: tip Pros
- Works naturally across your product's subdomains
- Safari's top-level bridge matches the top-level origin (no ROR needed)
- Traditional WebAuthn model
:::

::: warning Cons
- Each product/domain needs its own credential
- No composability with wallets: cannot reuse passkey wallet across apps on different domains (e.g., `social-app.com` vs `defi-app.com`)
- If you switch to a different base domain later, old credentials won't appear
:::

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



## Migrating wallet origins

To move the wallet host without losing passkeys, keep `rpId` stable:

```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.web3authn.org',  // New host
  rpIdOverride: 'web3authn.org',              // Old rpId (unchanged)
}
```

Update ROR manifest on the rpId domain to include the new host, delegate WebAuthn to both origins during transition, then gradually migrate traffic. Credentials remain discoverable because they're bound to `rpId`, not the iframe host.


## Testing your strategy

**Browser compatibility:**
- Chrome/Firefox: Both strategies work well
- Safari: Iframe WebAuthn often blocked, top-level bridge requires ROR for wallet-scoped

**Verification checklist:**
1. Check ROR manifest: `curl https://<rpId>/.well-known/webauthn`
2. Verify Permissions-Policy header in DevTools Network tab
3. Inspect iframe has `allow="publickey-credentials-get; publickey-credentials-create"`
4. Confirm passkey appears in browser password manager with correct `rpId`


## Common issues and fixes

### "WebAuthn not available" in iframe
::: tip **Cause:** Permissions-Policy not set or iframe `allow` attribute missing.

**Fix:**

1. Add header: `Permissions-Policy: publickey-credentials-get=(self "https://wallet.web3authn.org")`
2. Ensure iframe has: `allow="publickey-credentials-get; publickey-credentials-create"`
3. Check the SDK's Vite plugin is enabled
:::

### Passkey not appearing in Safari
::: tip **Cause:** ROR manifest missing or incorrect.

**Fix:**

1. Serve `/.well-known/webauthn` on the `rpId` domain
2. Include all top-level origins in the `origins` array
3. Verify with: `curl https://<rpId>/.well-known/webauthn`
4. Clear Safari's passkey cache: Settings → Passwords → Remove test passkeys
:::

### Passkey works locally but not in production
::: tip **Cause:** Mismatched `rpId` configuration or HTTPS issues.

**Fix:**

1. Verify `rpIdOverride` is set correctly in production config
2. Ensure all origins use HTTPS (WebAuthn requires secure context)
3. Check production ROR manifest matches local configuration
4. Verify Permissions-Policy header is sent in production

:::

### Cannot reuse passkey across apps
::: tip **Cause:** Wrong `rpId` strategy or ROR not configured.

**Fix:**

- For wallet-scoped: Ensure ROR manifest includes all app origins
- For app-scoped: Apps must share the same base domain
- Verify `rpIdOverride` is consistent across all apps
:::





## Next steps

- Learn about [VRF-backed challenges](/docs/concepts/vrf-webauthn)
- Understand the [architecture and iframe isolation model](/docs/concepts/architecture)
- Review the [security model](/docs/concepts/security-model)
