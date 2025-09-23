# API and Events Improvements for Lit Components

This document proposes small, high‑impact changes to make our Lit component layer (confirmers, viewers, embedded buttons) more robust and maintainable.

## Goals
- Centralize public tags, events, and window messages.
- Make lifecycle predictable (single mount surface, consistent close semantics).
- Reduce style drift via shared tokens and helpers.
- Add guardrails to prevent regressions (lint/tests/docs).

## APIs & Events
- Event constants: Add `src/core/WebAuthnManager/LitComponents/events.ts` exporting typed event names, e.g.
  - `W3A_TX_CONFIRMER_CONFIRM`, `W3A_TX_CONFIRMER_CANCEL` with `CustomEvent<{ confirmed?: boolean; error?: string }>`.
- Window message constants: Move UI window messages into a common enum (or literal union) in `src/core/WalletIframe/shared/messages.ts` (e.g., `MODAL_TIMEOUT`) and import everywhere.
- Single mount surface: Clearly document that confirmers must be mounted only via `confirm-ui.ts` (portal‑based replacement). Do not append confirmers elsewhere.

## Structure & Lifecycle
- ConfirmElementBase: Extract a base class to share common logic across modal/drawer confirmers:
  - ESC handling, two‑phase close (deferClose), window focus, and `MODAL_TIMEOUT` reaction.
- Overlay manager: Encapsulate the full‑viewport overlay toggling in a tiny helper/element (used by the router and any component that needs activation) with shared z‑index and pointer‑event rules.
- Define‑once helper: Add `defineOnce(tag, ctor)` in `tags.ts` to replace repeated `if (!customElements.get(tag))` patterns and use it across elements.

## Styling & Theming
- Token map: Promote a single token source → CSS variables helper so components can call `applyStyles(tokens, prefix)` and get:
  - Host‑level vars (e.g., `--w3a-colors-*`, `--w3a-text-*`).
  - Component‑scoped vars (e.g., `--w3a-<prefix>__section__prop`).
- Z‑index constants: Centralize values (e.g., `OVERLAY = 2147483646`, `MODAL = 2147483647`) in a small `z-index.ts` module and import where needed (router + confirmers).

## Tooling & Tests
- Lint guard: Add a rule (or script) to forbid hardcoded custom element tag strings for known components; require imports from `tags.ts`.
- Smoke tests: Minimal `@open-wc/testing` tests for:
  - Timeout → cancel → element detaches.
  - Portal singleton: a new mount replaces the previous instance.
- Demo sandbox: A small kitchen‑sink page or story to manually QA modal/drawer variants with mock data.

## Docs & Conventions
- Conventions doc: Extend `docs/lit-styles.md` (or new `docs/lit-components.md`) with:
  - Always import tags from `tags.ts` and events from `events.ts`.
  - Confirmers use two‑phase close (set `deferClose = true`).
  - Mount through `confirm-ui.ts` only; do not mount directly.
  - Keep required child tags declared via `requiredChildTags` and keep classes in `keepDefinitions` to prevent tree‑shaking.

## Migration Notes (incremental)
- Introduce `events.ts` and replace raw string event names across confirmers/hosts.
- Switch window message literals (e.g., `MODAL_TIMEOUT`) to shared constants.
- Adopt `defineOnce()` for any new elements; gradually sweep older definitions.
- Add lint rule and fix violations opportunistically.
- Add a couple of smoke tests to cover timeout/cancel and singleton mount.

## Status
- Tags centralized in `tags.ts` (modal/drawer/content/tree/halo/drawer/export viewer).
- Confirm UI mounts through a portal (singleton) and router+host clean up on cancel/timeout.
- Next wins: event/message constants, base confirmer mixin, and a lint guard.

