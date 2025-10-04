/**
 * # WebAuthnFallbacks - Safari WebAuthn and WASM Worker Compatibility Layer
 *
 * This folder contains utilities and fallback mechanisms to handle Safari-specific
 * limitations with WebAuthn in cross-origin iframe contexts and WASM worker interactions.
 *
 * ## Overview
 *
 * Safari has several quirks that require special handling:
 * 1. WASM worker message routing issues with control pings
 * 2. Cross-origin iframe WebAuthn restrictions
 * 3. Document focus requirements for WebAuthn operations
 *
 * This documentation consolidates three key areas:
 * - WASM Worker Bugs (control ping routing)
 * - Cross-Origin WebAuthn Parent Bridge
 * - Fallback Orchestration Architecture
 */

// ============================================================================
// SECTION 1: Safari WebAuthn WASM Worker Bugs — Root Cause and Fix
// ============================================================================

export const SAFARI_WASM_WORKER_BUGS_DOC = `
# Safari WebAuthn WASM Worker Bugs — Root Cause and Fix

## Summary
- The signer WASM worker was not actually failing to load in Safari. It failed its first message because a control ping { type: "WORKER_PING" } was routed through the worker's main message path and forwarded to the Rust handler, which expects a numeric enum (u32) for type.
- This produced errors like: "invalid type: string 'WORKER_PING', expected u32", after which the worker marked itself as processed/closed. The subsequent real request (e.g., { type: 8 }) then failed with "Worker has already processed a message."
- Fix: stop sending the ping, or ensure control messages are not parsed as typed requests. Optionally harden the worker to ignore any non‑numeric type values.

## Symptoms
- Registration/signing flows work in Chrome but fail in Safari.
- Logs show the worker receiving WORKER_PING first, then JSON parse errors and "already processed" errors.
- Example messages observed:
  - [signer-worker] received message – {type: "WORKER_PING"}
  - [signer-worker]: Message processing failed: Failed to parse message: invalid type: string "WORKER_PING", expected u32
  - worker error response: { … error: "Worker has already processed a message" }

## Root Cause
- The manager sends an early ping immediately after worker creation for health checks.
  - File: passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts:164
    - worker!.postMessage({ type: 'WORKER_PING' });
- The signer worker should ignore control pings, but in Safari the ping was delivered to the main processing path before the ignore guard took effect (or a cached build without the guard was used).
  - Ignore guard (intended): passkey-sdk/src/core/web3authn-signer.worker.ts:202
  - Main processing path (where the ping was forwarded to Rust): passkey-sdk/src/core/web3authn-signer.worker.ts:~180+
- Rust expects a numeric type (u32). Receiving the string "WORKER_PING" triggers a parse error, after which the worker marks itself as processed and rejects any subsequent real request.

## Why logs appeared only after upgrading to Safari Technology Preview
- Stable Safari often does not forward console logs from module workers and srcdoc iframes to the main page console by default. You typically need to open the dedicated worker/iframe target in Web Inspector to see them.
- Safari Technology Preview has improved DevTools behavior and forwarding of worker console output, so you started seeing detailed [signer-worker] logs there without extra steps.

## Fix
Pick one of these approaches (A recommended, B optional if you must keep a ping):

A) Remove the ping entirely
- Delete the control ping send:
  - passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts:164
  - The worker already posts a readiness signal: WORKER_READY at passkey-sdk/src/core/web3authn-signer.worker.ts:151.

B) Keep a control ping but make it unambiguous
- Do not use the type field for control messages. For example, send { __control: 'WORKER_PING' } so the Rust JSON parser never sees it as a typed request.
- Alternatively, harden the worker to early‑return on any non‑numeric type values before calling into Rust.

## Additional hardening (recommended)
- In web3authn-signer.worker.ts, keep and strengthen the guard:
  - Early‑return if typeof event.data?.type !== 'number'.
  - Ensure messageProcessed = true is set only after validating a first valid numeric message (or after handle_signer_message resolves), so control/invalid messages never flip the processed state.
- You already attached a cache‑buster to the worker URL for Safari‑like engines. Keep it to avoid stale worker caching where a previous build might lack the guard.

## Verification checklist
- Create worker → see WORKER_READY before any request.
- First processed message is the real numeric request (e.g., { type: 8 }), not WORKER_PING.
- No more "invalid type: string 'WORKER_PING', expected u32" errors.
- Drawer/Modal confirm flows in Safari proceed to Touch ID/Face ID prompt when the user clicks "Next", not "User cancelled".

## File references
- Manager ping sender: passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/index.ts:164
- Worker readiness ping: passkey-sdk/src/core/web3authn-signer.worker.ts:151
- Worker ignore guard for control pings: passkey-sdk/src/core/web3authn-signer.worker.ts:202

## Related Safari error: "The origin of the document is not the same as its ancestors."

This error appears when WebAuthn APIs (navigator.credentials.create/get) are invoked in a document whose ancestor chain is cross‑origin and the browser does not grant the publickey-credentials-* permissions to that embedded context.

What's happening
- Our wallet runs inside an iframe at a dedicated origin (e.g., https://wallet.example.localhost). Safari may reject WebAuthn from such frames with the above error unless Permissions Policy is correctly configured and supported by the Safari version.

Fixes and hardening
- Ensure the wallet iframe element carries an allow attribute that uses Safari‑recognized Permissions Policy grammar. We now set:
  - publickey-credentials-get=(self "https://wallet.example.localhost")
  - publickey-credentials-create=(self "https://wallet.example.localhost")
  - plus clipboard entries for embedded UI.
- Fallback: for older engines, we also set a legacy allow value with * to maximize compatibility.
- Ensure the top‑level responses include a matching Permissions-Policy header (dev plugin already sends: publickey-credentials-get=(self "<walletOrigin>"), publickey-credentials-create=(self "<walletOrigin>")).
- If you must support older Safari versions that do not honor Permissions Policy for WebAuthn in iframes, run the wallet host on the same origin as the parent page (no cross‑origin ancestor), or execute WebAuthn calls in the top‑level page.

References in repo
- Iframe allow attribute (updated): passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts
- Dev server Permissions-Policy headers: passkey-sdk/src/plugins/vite.ts
`;

// ============================================================================
// SECTION 2: Safari Cross-Origin WebAuthn Parent Bridge
// ============================================================================

export const SAFARI_CROSS_ORIGIN_WEBAUTHN_DOC = `
# Safari Cross-Origin WebAuthn Parent Bridge

## Summary
- Goal: Keep the wallet UI + logic inside a cross‑origin iframe while making WebAuthn work on Safari.
- Constraint: No popups or redirects; the wallet must remain embedded.
- Approach: Run WebAuthn in the iframe by default. For Safari's cross‑origin limitation on creation, fall back to a parent‑performed bridge that executes the WebAuthn call in the top‑level document and postMessages the serialized credential back to the wallet iframe.

## Current Decision
- Default RP ID: example.localhost (the parent/base domain) for wallet‑iframe mode.
- Rationale: Ensures the Safari bridge can execute WebAuthn at the top level without RP ID mismatches, keeping the UI fully cross‑origin in the iframe. This is the most reliable path across engines without popups.
- Tradeoff: Credentials are scoped to the parent/base domain. If you later require wallet‑domain scoping, adopt Related Origin Requests (ROR) or a wallet‑origin top‑level context.

## Browser Behavior
- Chromium/Firefox: Allow WebAuthn in cross‑origin iframes with proper Permissions-Policy and iframe allow attributes.
- Safari:
  - Creation (registration) is blocked in cross‑origin iframes with a NotAllowedError about ancestors' origin.
  - Assertion (authentication/login) can work inside a cross‑origin iframe if the parent delegates permission and it's triggered by a user gesture. If Safari still throws the ancestor error, use the same parent bridge as a fallback.

## What We Implemented
- Parent bridge on the host page: Listens for WALLET_WEBAUTHN_CREATE and WALLET_WEBAUTHN_GET, performs navigator.credentials.create/get() at top‑level, serializes, and replies with WALLET_WEBAUTHN_*_RESULT to the wallet iframe.
  - File: passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:87 (create) and :106 (get)
  - Security: filters by event.origin === walletOrigin; replies with postMessage(..., walletOrigin).
- Wallet fallback inside the iframe:
  - Registration: On Safari's ancestor error, send WALLET_WEBAUTHN_CREATE to the parent and await the result.
    - File: passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:241
  - Assertion: Try normally from the iframe. If the ancestor error occurs, send WALLET_WEBAUTHN_GET to the parent and await the result.
    - File: passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:316
- Serialized‑credential acceptance: When the bridge returns a credential already serialized with PRF outputs, downstream paths detect it and skip re‑serialization.
  - Files: passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/flows/registration.ts:120, passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:146, 175

## Runtime Flow
- Normal path (all browsers):
  1) Iframe calls navigator.credentials.create/get() with explicit rpId and PRF extension.
  2) Serialize credential with PRF; proceed with the VRF + signing flows.
- Safari fallback:
  1) Iframe call throws ancestor NotAllowedError.
  2) Iframe posts WALLET_WEBAUTHN_CREATE (or ...GET) + requestId + options to window.parent.
  3) Parent executes WebAuthn at top level, serializes, and returns WALLET_WEBAUTHN_*_RESULT.
  4) Iframe resolves the pending promise and proceeds.

## RP ID Strategy
- Default: The wallet picks an rpId via TouchIdPrompt.getRpId()
  - If an override is provided and is a registrable suffix of the host, use it; otherwise use the iframe host (wallet) hostname.
  - File: passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:123
- Parent bridge behavior: By default the parent bridge sets rp.id or rpId to the top‑level hostname if it is not provided. If rp.id/rpId is provided by the wallet, it is preserved (enabling ROR scenarios).
  - Default binds credentials to the parent domain.
  - Current default: Keep rpId = example.localhost to align with the parent bridge and avoid mismatches.
  - If you require credentials bound to the wallet domain while still creating them at top level, enable Related Origin Requests (ROR) and pass the wallet RP ID through.

## Related Origin Requests (ROR)
- ROR lets a top‑level page on Origin A create/assert credentials for RP ID B if B opts‑in.
- Serve /.well-known/webauthn on the wallet origin with JSON that lists the parent origin as allowed.
- Example (hosted at https://wallet-provider.com/.well-known/webauthn):
  {
    "origins": [
      "https://www.example.com"
    ]
  }
- With ROR, the parent can execute navigator.credentials.create() using rp.id = "wallet-provider.com", keeping credentials bound to the wallet domain, while still running at top‑level on the parent. Treat as progressive enhancement (Safari 18+).
- Dev convenience: The Vite plugin serves /.well-known/webauthn when VITE_ROR_ALLOWED_ORIGINS is set (comma‑separated). In examples/vite-secure, this is also wired via the relatedOrigins option.

## Permissions Policy + Iframe Allow
- Parent response header should delegate:
  - Permissions-Policy: publickey-credentials-get=(self "https://wallet.example.localhost"), publickey-credentials-create=(self "https://wallet.example.localhost")
- Iframe element allow attribute:
  - Safari fallback (permissive): publickey-credentials-get *; publickey-credentials-create *; clipboard-read; clipboard-write
  - Other engines: publickey-credentials-get 'self' https://wallet.example.localhost; publickey-credentials-create 'self' https://wallet.example.localhost; clipboard-read; clipboard-write
  - File: passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:131

## Security Considerations
- Parent bridge implies the parent can observe and mediate WebAuthn calls executed at the top level.
- Always:
  - Validate event.origin === walletOrigin in the parent bridge.
  - Use correlation requestId and timeouts.
  - Target replies to the wallet origin, not *.
  - Consider ROR if you must bind credentials to the wallet domain but execute at the parent.
- If the threat model forbids parent‑executed WebAuthn, the only alternative is a wallet‑origin top‑level context (popup/redirect), which this project avoids by design.

## When To Bridge
- Creation (registration): Always bridge on Safari when the ancestor error is thrown. If Safari reports "The document is not focused", the iframe first attempts a quick refocus+retry, then bridges if still blocked.
- Assertion (authorization/login): Attempt in the iframe with proper delegation and user gesture. If Safari throws either the ancestor error or "The document is not focused", perform a quick refocus+retry and then bridge to the parent as a fallback.

## Testing Checklist (Safari)
- Observe initial iframe attempt and ancestor NotAllowedError for create().
- Confirm parent bridge receives WALLET_WEBAUTHN_CREATE and returns ..._RESULT.
- Ensure serialized credential contains PRF results and flows continue.
- For get(), validate it works inside the iframe with proper delegation; if not, confirm the fallback.
- Verify rpId logs from the iframe and ensure they match your policy (parent domain vs wallet domain with ROR).

## Key File Touchpoints
- Iframe → parent bridge invocation and fallbacks
  - passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:241 (create fallback)
  - passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:316 (get fallback)
- Parent bridge handlers and iframe permissions
  - passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:87 (create handler)
  - passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:106 (get handler)
  - passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:131 (iframe allow)
- Serialized credential handling with PRF
  - passkey-sdk/src/core/WebAuthnManager/credentialsHelpers.ts:1
  - passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/flows/registration.ts:120

## Operational Notes
- The bridge is only used when the iframe attempt fails with the Safari ancestor error; other browsers stay on the direct path.
- If you need to forbid parent‑scoped credentials, implement ROR and avoid overriding rp.id inside the parent bridge.

## Implementation Plan
- Scope: Only apply the parent bridge for WebAuthn creation (registration + link‑device flows). Keep assertions in‑iframe with delegation; use bridge only on ancestor error.
- Parent Bridge (top‑level): Handle WALLET_WEBAUTHN_CREATE and perform navigator.credentials.create(); serialize with PRF; postMessage result to wallet iframe origin. Preserve rp.id if provided to support ROR.
- Iframe Fallback (wallet): On NotAllowedError "origin … not the same as its ancestors", post WALLET_WEBAUTHN_CREATE with options and await WALLET_WEBAUTHN_CREATE_RESULT.
- Security: Validate event.origin, correlate with requestId, and time out listeners.
- RP ID: Default to base domain (example.localhost) for broad compatibility. Optionally supply wallet RP ID with ROR enabled.

## TODO Checklist
- [x] Parent bridge: create handler with origin checks and serialization.
- [x] Iframe fallback: registration create() → parent bridge on ancestor error.
- [x] Preserve rp.id/rpId when provided (enable ROR scenarios).
- [x] Dev support: Serve /.well-known/webauthn via Vite (relatedOrigins or VITE_ROR_ALLOWED_ORIGINS).
- [x] Docs: Permissions‑Policy + iframe allow guidance.
- [x] Config: Optional flag to disable assertion (get) fallback by default (keep it as emergency path only). Field: iframeWallet.enableSafariGetWebauthnRegistrationFallback.
- [ ] Tests: Unit/integration to simulate ancestor error and verify bridge round‑trip and serialization.
- [ ] Prod docs: Short guide to host /.well-known/webauthn and verify headers (Cache‑Control, content type) on wallet origin.
`;

// ============================================================================
// SECTION 3: Safari WebAuthn Fallback Refactor Architecture
// ============================================================================

export const SAFARI_FALLBACK_REFACTOR_DOC = `
# Safari WebAuthn Fallback Refactor

This document outlines how to isolate and harden the Safari/WebAuthn fallbacks, make behavior idempotent, and improve readability and maintainability.

## Current State (summary)
- Fallback logic lives inside TouchIdPrompt:
  - Detects ancestor-origin and "document is not focused" NotAllowedError.
  - Attempts focus-and-retry for Safari focus issues.
  - Bridges WebAuthn calls to the top-level via postMessage when needed.
- Parent bridge handlers live in core/WalletIframe/client/IframeTransport.ts.
- rpId policy is mostly centralized via getRpId(); create() may bridge ahead of the first attempt when origin and rpId differ.

## Refactor Goals
- Single source of truth for rpId across VRF and WebAuthn.
- One small, testable orchestrator for WebAuthn retries and fallbacks.
- Separate, focused utilities for:
  - Error classification
  - Focus handling
  - Parent-bridge messaging
  - rpId policy
- Idempotent behavior with robust cleanup and timeouts.
- Clear comments and structure.

## 1) WebAuthn Fallback Orchestrator
Create src/core/WebAuthnManager/webauthn-orchestrator.ts to own the try → repair → retry flow for both create and get.

API shape:
- executeWithFallbacks(kind: 'create' | 'get', options, deps): Promise<PublicKeyCredential | SerializedCredential>
- Deps (injected for testability):
  - rpId: string
  - inIframe: boolean
  - bridgeClient: { request(kind, publicKey, timeoutMs): Promise<SerializedCredential|null> }
  - focusUtils: { attemptRefocus(maxRetries?: number, delays?: number[]): Promise<boolean> }
  - errorClassifier: { isAncestorOriginError(e): boolean; isDocumentNotFocusedError(e): boolean }
  - timeoutMs?: number

Behavior:
- create():
  1) If inIframe and host !== rpId, bridge immediately (aligns clientDataJSON.origin to rpId).
  2) Else native attempt.
  3) On ancestor-origin → bridge.
  4) On doc-not-focused → refocus and retry once; if still blocked and inIframe → bridge.
- get():
  1) Native attempt.
  2) On ancestor-origin → bridge (behind config/flag if desired).
  3) On doc-not-focused → refocus and retry; if still blocked and inIframe → bridge.

Idempotency:
- Only one resolve path per call (native or bridge). All timers/listeners are cleaned up deterministically.

## 2) Parent Bridge Client
Create src/core/WebAuthnManager/parent-bridge-client.ts to encapsulate postMessage bridge.

API:
- request(kind: 'WALLET_WEBAUTHN_CREATE'|'WALLET_WEBAUTHN_GET', publicKey, timeoutMs): Promise<SerializedCredential|null>

Traits:
- Generates a unique requestId.
- Registers one message listener; removes it on resolve/timeout.
- Returns null on timeout or explicit error.
- Clear comments explaining event origin checks and correlation.

## 3) Error Classification
Create src/core/WebAuthnManager/webauthn-errors.ts.

API:
- isAncestorOriginError(e: unknown): boolean
- isDocumentNotFocusedError(e: unknown): boolean
- (optional) isAbortOrTimeout(e: unknown): boolean

Keep the regexes and name checks in one place with comments about known Safari behaviors.

## 4) Focus Utilities
Create src/core/WebAuthnManager/focus-utils.ts.

API:
- attemptRefocus(maxRetries = 2, delays: number[] = [50, 120]): Promise<boolean>

Implementation notes:
- Try window.focus() and document.body.focus().
- Wait briefly between attempts; return document.hasFocus() if possible.
- Always safe to call; never throws.

## 5) rpId Policy (optional extraction)
Create src/core/WebAuthnManager/rpid-policy.ts to host rpId logic.

API:
- resolveRpId(override?: string, host?: string): string
- isRegistrableSuffix(host: string, override: string): boolean
- shouldBridgeCreate(rpId: string, host: string, inIframe: boolean): boolean

TouchIdPrompt.getRpId() becomes a thin wrapper that delegates to resolveRpId().

## 6) Slim TouchIdPrompt
Refactor TouchIdPrompt to:
- Resolve rpId via policy.
- Build publicKey options for create/get.
- Call executeWithFallbacks and return credentials (native or serialized via bridge).

Keep only the serialization guard for already-serialized credentials (or move that into credentialsHelpers).

## 7) Robustness & Idempotency
- Orchestrator ensures exactly one completion path.
- Bridge client always cleans up listeners/timeouts.
- Consistent timeouts are honored on all paths.

## 8) Readability & Comments
- Top-of-file summary in each new module:
  - Why it exists, what problem it solves, and how it's used.
- Orchestrator: include a short flowchart-style block comment:
  - create(): bridge-first decision when host != rpId (in iframe) → else native → repairs.
  - get(): native-first → repairs on specific errors.
- Parent bridge: comment on origin/correlation-security explicitly.

## 9) Tests
Add unit tests (no browser required) for:
- Orchestrator decision matrix (native ok, ancestor error, focus error, both).
- rpId policy (override, host, and iframe combinations) → shouldBridgeCreate.
- Bridge client request lifecycle (resolve/timeout/cleanup).

## 10) Naming / Config Cleanups (optional)
- Consider renaming enableSafariGetWebauthnRegistrationFallback to enableGetBridgeFallback to make behavior error-driven rather than UA-driven.
- Keep Safari specifics encapsulated inside the error classifier.

## Migration Notes
- The refactor maintains existing behavior: Chrome mismatch fixed, Safari errors bridged, rpId unified.
- The only behavior change is the move of decision logic into smaller modules; no UX changes are expected.

## Appendix: Orchestrator Pseudocode

async function executeWithFallbacks(kind, publicKey, deps) {
  const { rpId, inIframe, bridgeClient, focusUtils, errorClassifier, timeoutMs } = deps;

  const tryNative = async () => {
    return kind === 'create'
      ? await navigator.credentials.create({ publicKey })
      : await navigator.credentials.get({ publicKey });
  };

  // create(): if host != rpId and in iframe, bridge first
  if (kind === 'create' && inIframe && window.location.hostname !== rpId) {
    const bridged = await bridgeClient.request('WALLET_WEBAUTHN_CREATE', publicKey, timeoutMs);
    if (bridged) return bridged;
  }

  try {
    return await tryNative();
  } catch (e) {
    if (errorClassifier.isAncestorOriginError(e) && inIframe) {
      const bridged = await bridgeClient.request(
        kind === 'create' ? 'WALLET_WEBAUTHN_CREATE' : 'WALLET_WEBAUTHN_GET',
        publicKey,
        timeoutMs,
      );
      if (bridged) return bridged;
      throw e;
    }

    if (errorClassifier.isDocumentNotFocusedError(e)) {
      if (await focusUtils.attemptRefocus()) {
        try { return await tryNative(); } catch (_) {}
      }
      if (inIframe) {
        const bridged = await bridgeClient.request(
          kind === 'create' ? 'WALLET_WEBAUTHN_CREATE' : 'WALLET_WEBAUTHN_GET',
          publicKey,
          timeoutMs,
        );
        if (bridged) return bridged;
      }
    }

    throw e;
  }
}

This design keeps all Safari-specific behavior contained within error classification and the orchestrator, while the rest of the code remains clean and declarative.
`;

// ============================================================================
// Quick Reference
// ============================================================================

/**
 * Quick reference for common Safari WebAuthn issues and solutions:
 *
 * Issue 1: WASM Worker Control Ping Errors
 * - Symptom: "invalid type: string 'WORKER_PING', expected u32"
 * - Solution: Remove control ping or use non-numeric type field
 * - Files: SignerWorkerManager/index.ts, web3authn-signer.worker.ts
 *
 * Issue 2: Cross-Origin Ancestor Error
 * - Symptom: "The origin of the document is not the same as its ancestors"
 * - Solution: Parent bridge that executes WebAuthn at top-level and postMessages result
 * - Files: WalletIframe/client/IframeTransport.ts, touchIdPrompt.ts
 *
 * Issue 3: Document Not Focused Error
 * - Symptom: NotAllowedError about document focus
 * - Solution: Attempt refocus with retry, then bridge if still blocked
 * - Files: touchIdPrompt.ts (focus utilities)
 *
 * Architecture Goal:
 * - Isolate fallback logic into dedicated orchestrator
 * - Separate error classification, focus handling, and bridge client
 * - Make behavior idempotent and testable
 */

