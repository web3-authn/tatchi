---
title: Credential Scope (rpId Strategy)
---

# Credential Scope (rpId Strategy)

This doc explains two deployment patterns for WebAuthn `rpId` and how to choose between them. Your choice affects which passkeys are shown to users and how you integrate across origins.

Terms
- `rpId`: Relying Party ID. A registrable domain (no scheme/port). Passkeys are bound to this value.
- Wallet origin: The domain that hosts the wallet iframe/service, e.g. `wallet.example.com` or `web3authn.org`.
- App origin: The domain of the embedding application, e.g. `app.example.com` or `example.com`.

## Option A — Wallet‑Scoped Credentials
- `rpId = <wallet domain>` (e.g., `web3authn.org` or `wallet.example.com`).
- Behaves like an auth server: a single passkey is reusable across many apps that integrate the wallet.
- Top‑level execution is required for cross‑origin flows; and when the app and wallet live on different registrable sites, Related Origin Requests (ROR) must be enabled so the parent can call WebAuthn using the wallet `rpId`.

Pros
- One credential per user, reusable across multiple apps.
- Clear trust boundary on the wallet provider domain.

Cons
- When the wallet is embedded cross‑origin, Safari blocks in‑iframe WebAuthn. The SDK bridges calls to the top‑level; if the top‑level origin differs from the wallet `rpId`, you must enable ROR.
- Firefox currently lacks broad ROR support; plan an app‑scoped fallback or show a developer‑facing guidance message on that browser.
- Migrating to a different `rpId` later won’t show existing credentials.

How to implement (Option A)
1) Choose the wallet domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<wallet-domain>'` (for example, `web3authn.org`).
   - The SDK passes this rpId to `navigator.credentials.create/get()`.
2) Enable top‑level bridge (already implemented)
   - The wallet iframe attempts WebAuthn in‑iframe; if Safari throws the ancestor/focus errors, it bridges to the parent via `postMessage`. The parent runs WebAuthn at top‑level and returns a serialized credential.
3) Enable ROR when app and wallet are on different registrable sites
   - Host `/.well-known/webauthn` on the wallet origin (it can be a dynamic route) with JSON listing allowed top‑level app origins:

```json
{
  "origins": [
    "https://app.example.com",
    "https://another-app.example.com"
  ]
}
```

4) Permissions Policy and iframe `allow`
   - Parent response header should delegate:
     `Permissions-Policy: publickey-credentials-get=(self "<wallet-origin>") , publickey-credentials-create=(self "<wallet-origin>")`
   - Iframe `allow` is set by the SDK; ensure your CSP does not block it.

Config snippet (Option A)
```ts
const passkey = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    walletServicePath: 'wallet-service',
    rpIdOverride: 'wallet.example.com',
    // Optional: allow Safari GET fallback when in an iframe
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

### Shared wallet across many apps (no ROR)

You can run truly “shared” credentials across unrelated apps without using `/.well-known/webauthn`, as long as WebAuthn runs inside the wallet iframe:

- Where it runs: the wallet iframe on `https://<wallet-domain>` calls `navigator.credentials.create/get()` with `rpId = <wallet-domain>`.
- Browser check: rpId is compared to the calling document’s effective host. Because the call originates from the wallet iframe, they match (for example: `claimed='wallet.tatchi.xyz', origin_host='wallet.tatchi.xyz', matches=true`). No ROR is consulted.
- Multiple apps: any origin (e.g., `https://app1.com`, `https://app2.com`, `https://hosted.tatchi.xyz`) can embed the wallet iframe and reuse the same wallet‑scoped credential.
- Required delegation on the parent page:
  - Response header must delegate WebAuthn to the wallet origin, for example:
    `Permissions-Policy: publickey-credentials-get=(self "https://wallet.tatchi.xyz"), publickey-credentials-create=(self "https://wallet.tatchi.xyz")`
  - The SDK sets the iframe `allow` attribute accordingly; ensure your CSP does not block it.
- Server verification (defense in depth): verify `clientDataJSON.origin === https://<wallet-domain>` and rpId hash; only accept assertions for challenges minted by your wallet service.

This pattern is “permissionless” in practice: you do not keep an allowlist, and any site can integrate by embedding the wallet iframe. Security stays bound to the wallet origin.

### When ROR is actually needed

`/.well-known/webauthn` (Related Origin Requests) is only required when a top‑level page needs to run WebAuthn with `rpId = <wallet-domain>`:

- Safari often blocks cross‑origin WebAuthn in iframes. The SDK includes a top‑level bridge fallback. If that path executes and the top‑level origin is different from the wallet rpId, the browser requires the wallet’s ROR manifest to include that top‑level origin.
- Chromium/WebKit honor ROR; Firefox support is limited. Plan a fallback (or keep flows in‑iframe) on Firefox.
- If you want to avoid ROR entirely, either:
  - Keep flows strictly in‑iframe and accept that Safari users may need a different fallback (e.g., device linking/QR), or
  - Use app‑scoped rpId (Option B) so top‑level calls naturally match the app’s base domain.

### Hardening tips for shared‑wallet mode

- Show the embedding site inside wallet UI (via a handshake or `document.referrer`) to keep users oriented.
- Require user activation for prompts; rate‑limit repeated attempts to reduce drive‑by prompts from hostile pages.
- Keep strict server checks: rpId hash, `clientDataJSON.origin`, signed challenge freshness.

## Option B — App‑Scoped Credentials
- `rpId = <app base domain>` (e.g., `example.com` or `example.localhost`).
- Passkeys are bound to the app’s base domain and work across its subdomains (e.g., `app.example.com`, `wallet.example.com`).
- Recommended when the app and wallet share a registrable suffix and you want Chrome/Firefox to surface credentials regardless of which subdomain is active.

Pros
- Works across subdomains of the app’s base domain.
- In Safari, top‑level bridging naturally matches the top‑level app domain, so ROR is not needed.

Cons
- Each distinct site needs its own credential (cannot reuse across unrelated domains like `example.com` and `web3authn.org`).
- If you previously registered credentials under the wallet domain, Chrome/Edge won’t show them after switching the `rpId`; users must re‑register.

How to implement (Option B)
1) Choose the app base domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<app-base-domain>'` (e.g., `example.com` or `example.localhost`).
2) Keep bridge fallback for Safari
   - Set `enableSafariGetWebauthnRegistrationFallback: true` to cover rare focus/ancestor cases in Safari.
3) Permissions Policy and iframe `allow`
   - Same as Option A. The SDK sets the iframe `allow`; ensure your server sends a compatible `Permissions-Policy`.

Config snippet (Option B)
```ts
const passkey = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: 'wallet-service',
    rpIdOverride: 'example.localhost', // app base domain
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

Choosing at build/runtime
- Build‑time: hardcode `rpIdOverride` to the mode you want in your prod env.
- Runtime: wire a toggle in dev/staging to test both; credentials are not portable across rpIds.

### Related Origin Requests (ROR) details
- See the iPhone dev guide for Safari behavior and setup.
- Serve `/.well-known/webauthn` as noted above when crossing registrable sites.
