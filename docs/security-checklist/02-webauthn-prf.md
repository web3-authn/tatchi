# Checklist B — WebAuthn + PRF Handling

Findings snapshot (pass 1).

- P2: RP ID strategy and ROR documented and implemented (good)
  - Evidence: docs/wallet-scoped-credentials.md; vite plugin headers: sdk/src/plugins/vite.ts:206–240
  - Note: Ensure production wallet domain serves `/.well-known/webauthn` when wallet‑scoped across unrelated sites.

- P2: PRF extraction robust to live/serialized credentials (good)
  - Evidence: sdk/src/core/WebAuthnManager/credentialsHelpers.ts:54–113
  - Handles missing `getClientExtensionResults`; enforces base64url; errors if required PRF missing.

- P2: Parent WebAuthn bridge only from wallet origin (good)
  - Evidence: sdk/src/core/WalletIframe/client/IframeTransport.ts:91; create/get paths serialize with PRF: :362, :379
  - Returns serialized credentials with PRF outputs.

Threat Model: PRF Exposure During Bridge (Safari cross‑origin)
- Why bridge exists: Safari blocks cross‑origin WebAuthn in iframes. The parent performs navigator.credentials.* on behalf of the wallet when necessary.
- Guardrails:
  - Parent only accepts bridge requests that originate from the wallet origin.
  - Registration (create) is relatively infrequent; GET may also be bridged when required.
  - An attacker needs wallet‑origin compromise (or equivalent) to trigger the bridge; and a compromised top‑level could read the PRF if it can run scripts at the time of the ceremony.
- Residual risk: On allowlisted top‑level apps (via ROR), an XSS or malicious extension can access PRF outputs during the bridged ceremony. This requires a user gesture and occurs only during the ceremony window.

- P2: Type‑safe serialization for WASM (good)
  - Evidence: sdk/src/core/WebAuthnManager/credentialsHelpers.ts:117–160, :190–239

- P2: ‘Skip’ UI mode still routes through confirmation bridge
  - Evidence: sdk/src/wasm_signer_worker/src/handlers/confirm_tx_details.rs:62–121
  - Recommendation: Gate `Skip`/`AutoProceed` via user preference and/or allowlist; ensure opt‑in defaults.

Additional notes
- Same‑origin mode: Reduced isolation by design. We warn at runtime when walletOrigin equals the app origin and recommend cross‑origin wallet in production.
- ROR (Related Origin Requests): Treat allowlisted top‑level origins as trusted surfaces; an XSS on those origins can access bridged PRF outputs with user gesture.

Clarifications (Q&A)
- Malicious extension with wallet‑origin host permissions (High)
  - Extensions obtain access via their manifest and user consent, not via the app. If a user installs an extension with host permissions for the wallet origin, it can inject into wallet pages and observe PRF outputs during ceremonies. This effectively models a wallet‑origin compromise from the user’s browser.

- Wallet origin compromise / supply‑chain (High)
  - Cross‑origin wallet architecture mitigates app supply‑chain issues: a compromised app origin cannot read wallet secrets. Only compromise of the wallet origin (or an extension with that origin’s host permissions) meaningfully threatens PRF secrecy.

- ROR misconfiguration abuse (Medium)
  - This is phishing‑like: an attacker needs an allowlisted top‑level origin and must convince users to perform TouchID at that origin’s page during a bridged ceremony. The bridge still requires a user gesture.

- Same‑origin mode (High risk if used)
  - We chose cross‑origin wallet specifically to avoid PRF exfiltration by the parent. Same‑origin is allowed for dev/legacy, but we now emit a console warning to discourage production use.

- Bottom line
  - Without wallet‑origin (or allowlisted top‑level) compromise, PRF outputs remain inside the wallet context except for the Safari top‑level bridge, where they exist briefly in the parent during the ceremony. That path is origin‑guarded and infrequent (registration/link device).

