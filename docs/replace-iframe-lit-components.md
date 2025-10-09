Replace nested iframe with a web component (<w3a-tx-confirmer>)

Context
- Today the tx confirmer UI is often rendered inside an extra sandboxed iframe via `sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/iframe-host.ts`, even when already running inside the wallet iframe.
- This creates a nested browsing context (wallet iframe → confirmer iframe) that complicates focus/user‑activation, Safari viewport behavior, postMessage wiring, and layering.

Goal
- Replace the nested iframe host with a first‑class custom element rendered inline in the wallet iframe: `<w3a-tx-confirmer>` (wrapper) that delegates to `<w3a-modal-tx-confirmer>` or `<w3a-drawer-tx-confirmer>`.
- Remove iframe usage entirely for the confirmer. No fallback.

Why this change
- Fewer activation pitfalls: One browsing context inside the wallet iframe preserves WebAuthn user activation more reliably on iOS/Safari.
- Simpler sizing: Avoid double fixed/dvh issues under iOS dynamic toolbars; we already hardened `<w3a-…>` components.
- Lower complexity: No postMessage bridge for simple prop updates and events.
- Performance: Fewer layers, no extra document bootstrap.

Scope
1) Introduce `<w3a-tx-confirmer>` wrapper element
2) Migrate all flows to inline render (only mode)
3) Remove iframe hosts and bootstrap code related to the confirmer
4) Update tests, docs, and public API references

Design
- New wrapper: `<w3a-tx-confirmer variant="modal|drawer">`
  - Props: `near-account-id`, `tx-signing-requests`, `vrf-challenge`, `theme`, `title`, `confirm-text`, `cancel-text`, `defer-close`, `error-message`, etc.
  - Internals: Creates and renders either `<w3a-modal-tx-confirmer>` or `<w3a-drawer-tx-confirmer>` and forwards all props and events.
  - Events: Rebroadcasts canonical events (`w3a:tx-confirmer-confirm`, `w3a:tx-confirmer-cancel`).

- Tags registry (`sdk/src/core/WebAuthnManager/LitComponents/tags.ts`):
  - Add `W3A_TX_CONFIRMER_ID = 'w3a-tx-confirmer'` and keep existing `W3A_MODAL_TX_CONFIRMER_ID`, `W3A_DRAWER_TX_CONFIRMER_ID`.

- Wallet host mounter (`sdk/src/core/WalletIframe/host/iframe-lit-elem-mounter.ts` and `wallet-iframe-host.ts`):
  - Mount `<w3a-tx-confirmer>` inline.
  - Pass props directly; subscribe to DOM events instead of postMessage.
  - Delete the code path that mounts `w3a-iframe-tx-confirmer`.

- Router (`sdk/src/core/WalletIframe/client/router.ts`):
  - No change to high‑level API; compose existing progress/overlay behavior, just target the inline element instead of iframe.
  - OverlayController remains the visibility orchestrator.

Migration plan (single-pass)
- Add `<w3a-tx-confirmer>` element and export from `index.ts` for Lit components.
- Replace all confirmer mounts to use the wrapper inline.
- Remove `sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/iframe-host.ts` and its bootstrap module.
- Remove any tags/exports for `w3a-iframe-tx-confirmer`.
- Delete postMessage paths and listeners related only to the inner iframe confirmer.

Implementation steps (concrete)
1. Wrapper element
   - New file: `sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer/tx-confirmer-wrapper.ts`
   - Define `W3A_TX_CONFIRMER_ID` in tags.
   - Render chosen variant; forward attributes/props and re‑emit confirm/cancel events.

2. Host mounting
   - Update `iframe-lit-elem-mounter.ts` to mount `<w3a-tx-confirmer>` into the confirm portal.
   - Add helpers to wire listeners and to imperatively close when host decides.

3. Wallet host
   - In `wallet-iframe-host.ts`, when handling UI mount for confirmer, always mount inline.
   - Remove postMessage plumbing that only existed for the inner iframe path.

4. Router glue
   - No API changes; ensure overlay show/hide paths stay unchanged.
   - Ensure ESC key and timeout behaviors remain identical by letting the element emit canonical events.

5. Tests
   - Update selectors in `sdk/src/__tests__/lit-components/confirm-ui.*.test.ts` to use inline (`w3a-tx-confirmer`).
   - Remove tests that relied on nested iframe messaging.
   - Add coverage: event propagation, theme switching, ESC cancel, mobile width (100dvw), desktop backdrop, drawer drag.

6. Docs & examples
   - Examples: replace any explicit usage of the iframe host with `<w3a-tx-confirmer>`.
   - Remove guidance about using a nested iframe for the confirmer.

Compatibility & security
- Security stays enforced by the wallet iframe origin and its `allow` permissions. The nested iframe’s sandbox is no longer used.

Risks & mitigations
- Focus/activation regressions: Covered by existing overlay+Lit focus logic; fewer contexts should improve behavior.
- Host CSS leakage: Components use (mostly) closed shadow DOM and tokenized variables; minimal risk.
- Rollback: revert commit; since all iframe code is removed, rollback means restoring deleted files if needed.

Rollout timeline
- Week 1: Implement wrapper, replace all mounts, remove iframe code, land tests.
- Week 2: Monitor in examples/e2e; iterate if needed.

API sketch
```html
<w3a-tx-confirmer
  variant="drawer"
  theme="dark"
  near-account-id="alice.testnet"
  defer-close
></w3a-tx-confirmer>
```
Events (bubble, composed):
- `w3a:tx-confirmer-confirm` detail: `{ confirmed: true }`
- `w3a:tx-confirmer-cancel` detail: `{ confirmed: false }`

Out of scope
- Changing router public APIs
