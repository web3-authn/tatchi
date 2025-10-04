# Wallet‑Scoped vs App‑Scoped Credentials (rpId strategy)

This doc explains two deployment patterns for WebAuthn `rpId` and how to choose between them. Your choice affects which passkeys are shown to users and how you integrate across origins.

Terms
- `rpId`: Relying Party ID. A registrable domain (no scheme/port). Passkeys are bound to this value.
- Wallet origin: The domain that hosts the wallet iframe/service, e.g. `wallet.example.com` or `web3authn.org`.
- App origin: The domain of the embedding application, e.g. `app.example.com` or `example.com`.

Option A — Wallet‑Scoped Credentials
- `rpId = <wallet domain>` (e.g., `web3authn.org` or `wallet.example.com`).
- Behaves like an auth server: a single passkey is reusable across many apps that integrate the wallet.
- Requires top‑level execution for some browsers and/or Related Origin Requests (ROR) when the app and wallet are on different sites.

Pros
- One credential per user, reusable across multiple apps.
- Clear trust boundary on the wallet provider domain.

Cons
- When the wallet is embedded cross‑origin, Safari blocks in‑iframe WebAuthn. You must bridge calls to the top‑level and, if the top‑level origin differs from the wallet rpId, enable ROR.
- Migrating to a different rpId later won’t show existing credentials.

How to implement (Option A)
1) Choose the wallet domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<wallet-domain>'` (for example, `web3authn.org`).
   - The SDK passes this rpId to `navigator.credentials.create/get()`.
2) Enable top‑level bridge (already implemented)
   - The wallet iframe attempts WebAuthn in‑iframe; if Safari throws the ancestor/focus errors, it bridges to the parent via `postMessage`. The parent runs WebAuthn at top‑level and returns a serialized credential.
3) Enable ROR when app and wallet are on different sites
   - Host `/.well-known/webauthn` on the wallet origin with JSON listing allowed app origins:
     {
       "origins": [
         "https://app.example.com",
         "https://another-app.example.com"
       ]
     }
   - With ROR, the top‑level app can execute WebAuthn using `rp.id = '<wallet-domain>'` even though it runs on a different site.
4) Permissions Policy and iframe `allow`
   - Parent response header should delegate:
     `Permissions-Policy: publickey-credentials-get=(self "<wallet-origin>") , publickey-credentials-create=(self "<wallet-origin>")`
   - Iframe `allow` is set by the SDK; ensure your CSP does not block it.

Config snippet (Option A)
```ts
const passkey = new PasskeyManager({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    walletServicePath: '/service',
    rpIdOverride: 'wallet.example.com',
    // Optional: allow Safari GET fallback when in an iframe
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

Option B — App‑Scoped Credentials
- `rpId = <app base domain>` (e.g., `example.com` or `example.localhost`).
- Passkeys are bound to the app’s base domain and work across its subdomains (e.g., `app.example.com`, `wallet.example.com`).
- Recommended when the app and wallet share a registrable suffix and you want Chrome/Firefox to surface credentials regardless of which subdomain is active.

Pros
- Works across subdomains of the app’s base domain.
- In Safari, top‑level bridging naturally matches the top‑level app domain, so ROR is not needed.

Cons
- Each distinct site needs its own credential (cannot reuse across unrelated domains like `example.com` and `web3authn.org`).
- If you previously registered credentials under the wallet domain, Chrome won’t show them after switching the rpId; users must re‑register.

How to implement (Option B)
1) Choose the app base domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<app-base-domain>'` (e.g., `example.com` or `example.localhost`).
2) Keep bridge fallback for Safari
   - Set `enableSafariGetWebauthnRegistrationFallback: true` to cover rare focus/ancestor cases in Safari.
3) Permissions Policy and iframe `allow`
   - Same as Option A. The SDK sets the iframe `allow`; ensure your server sends a compatible `Permissions-Policy`.

Config snippet (Option B)
```ts
const passkey = new PasskeyManager({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: '/service',
    rpIdOverride: 'example.localhost', // app base domain
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

Choosing at build/runtime
- Build‑time: hardcode `rpIdOverride` to the mode you want (wallet or app domain).
- Runtime: derive from environment/tenant config before you instantiate `PasskeyManager`.
  - Example: `RP_ID_MODE=wallet` → set `rpIdOverride = process.env.WALLET_DOMAIN`.
  - Example: `RP_ID_MODE=app` → compute base domain from `window.location.hostname`.

Migration tips
- Switching rpId changes which passkeys are visible. To avoid user confusion:
  - Detect empty credential selection and guide the user to re‑register.
  - Offer a one‑time migration screen during login (e.g., “We updated our security settings; please confirm to save your passkey under the new domain”).

Safari specifics and focus errors
- The SDK already handles ancestor and “document is not focused” NotAllowedError by retrying focus and bridging to the top‑level as needed. See `docs/safari-cross-origin-webauthn.md`.

Security notes
- Parent bridge means the top‑level app can observe the fact that a WebAuthn call happened. The credential’s private key material is never exposed, but treat this as a conscious UX/security tradeoff.
- For Option A across unrelated sites, ROR is the standards‑compliant path to keep credentials bound to the wallet domain while executing at the top‑level app.

