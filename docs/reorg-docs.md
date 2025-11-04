# Tatchi Docs Reorg Plan

Goal: Restructure `examples/tatchi-docs/src/docs` to deliver a clear onboarding path for new developers and a sequential, narrative Concepts section that starts with wallet goals, proceeds to architecture, then dives into details.

---

## Current State — Inventory & Gaps

- Getting Started
  - `getting-started/install.md` — solid install + Vite plugin + env vars
  - `getting-started/quickstart.md` — React quickstart + vanilla TS
- Guides
  - Good starts: `passkeys.md`, `tx-confirmation.md`, `wallet-iframe.md`
  - Placeholders (to migrate from MDX or other sources): `cloudflare-*`, `relay-server.md`, `device-linking.md`, `guides/index.md`
- Concepts
  - Present: `wallet-iframe-architecture.md`, `wallet-scoped-credentials.md`, `rpid-policy.md`, `vrf-and-prf.md`, `shamir3pass.md`, `shamir3pass-rotate-keys.md`, `nonce-manager.md`, `csp-lit-components.md`
  - Missing: a top “Goals of the Wallet” page; a short “Security Model” overview to frame CSP, isolation, workers, and threat model at a high level
- API
  - `api/*` exists and is fine as a destination for details after onboarding

Observations
- The onboarding path is split between Getting Started and several Guides; it’s good but not linear from zero → first login → first transaction → configuring wallet origin.
- Concepts exist but are not sequenced as a story. New readers should first understand what the wallet is trying to achieve, then how we achieve it (iframe + isolation), then details (rpId policy, PRF/VRF, Shamir 3‑pass, Nonce Manager, CSP specifics, etc.).
- Multiple guides mention “to be migrated from MDX” — we should plan concrete migration targets and link sources.

---

## Reorganized Information Architecture (IA)

### 1) Getting Started (linear)
- Overview: “What is the Tatchi Wallet (Web3-Authn SDK)?”
  - Short value prop + a diagram; link to Concepts → Goals
- Install
- Quickstart (React recommended)
- Configure Wallet Iframe (wallet origin + Vite plugin)
- First Passkey: Register + Login
- First Transaction: Secure Confirmation (API-driven + React component)
- Next Steps (links to key Concepts and Guides)

Notes
- Keep “Install” and “Quickstart” as-is, but link forward to wallet-iframe config during quickstart instead of requiring users to discover it later.
- Move essential snippets from Guides into Getting Started subsections (at least a minimal flow) with “Read more in Guides”.

### 2) Concepts (narrative order)
1. Goals of the Wallet (new)
   - What problems we solve: isolation, zero-exposure of private keys/PRF, consistent UX, portability across apps, app/wallet separation
   - Principles: “no private keys on main thread”, “wallet origin is the trust boundary”, “typed message interfaces”, “user-presence for sensitive steps”
2. Architecture Overview (existing: wallet-iframe-architecture; revise)
   - The service iframe, handshake, message bus, when/why a visible modal appears
   - Workers (signer/VRF), IndexedDB at wallet origin
3. Security Model (new: overview)
   - Isolation guarantees, CSP philosophy (link to CSP doc), permissions policy/iframe allow, threat model (high-level), tests and assertions
4. Credential Scope Strategy (rpId)
   - Overview (rpid-policy) → deeper “Wallet-Scoped vs App-Scoped” (merge or keep as detail page)
5. PRF & VRF
   - PRF usage, deterministic keys, at-rest encryption, VRF worker + challenges
6. Shamir 3‑pass (UX + crypto)
   - Login UX; strict keyId; rotation overview (link to rotation page)
7. Nonce Manager
   - Why and how we ensure tx ordering
8. Confirmation UX Integrity (brief)
   - Overlay heuristics, modal confirm step, user-presence guarantees; link to guide and repo checklists
9. CSP for Lit Components (detail)
   - Keep as-is but framed as a deep dive

### 3) Guides (task-oriented)
- Passkeys (Register/Login/Use)
- Secure Transaction Confirmation (API + embedded component)
- Wallet Iframe (configuration and tips)
- Device Linking
- Relay Server (API endpoints + setup)
- Deployment
  - Cloudflare Worker
  - Cloudflare WASM Imports
  - Cloudflare + GitHub Actions
  - Asset URL resolution (from repo docs, if needed)
  - iPhone/Safari (Related Origin Requests) — if separate guide exists

### 4) API Reference
- Keep existing `api/*` and link from relevant guides/concepts.

---

## Proposed Sidebar/Nav Structure (VitePress)

Getting Started
- Overview (new): `/docs/getting-started/overview`
- Install & Configure: `/docs/getting-started/install-and-configure`
- Quickstart: `/docs/getting-started/quickstart`
- Configure Wallet Iframe: `/docs/getting-started/wallet-iframe`
- First Passkey: `/docs/getting-started/first-passkey`
- First Transaction: `/docs/getting-started/first-transaction`
- Next Steps: `/docs/getting-started/next-steps`

Concepts
1) Goals of the Wallet: `/docs/concepts/goals`
2) Architecture Overview: `/docs/concepts/wallet-iframe-architecture`
3) Security Model: `/docs/concepts/security-model`
4) Credential Scope: `/docs/concepts/wallet-scoped-credentials`
5) VRF & PRF: `/docs/concepts/vrf-and-prf`
6) Shamir 3‑pass: `/docs/concepts/shamir3pass` → Rotation: `/docs/concepts/shamir3pass-rotate-keys`
7) Nonce Manager: `/docs/concepts/nonce-manager`
8) Confirmation UX: `/docs/concepts/confirmation-ux`
9) CSP for Lit Components: `/docs/concepts/csp-lit-components`

Guides
- Passkeys: `/docs/guides/passkeys`
- Secure Tx Confirmation: `/docs/guides/tx-confirmation`
- Wallet Iframe: `/docs/guides/wallet-iframe`
- Device Linking: `/docs/guides/device-linking`
- Relay Server: `/docs/guides/relay-server`
- Deployment (group):
  - Cloudflare Worker: `/docs/guides/cloudflare-worker`
  - Cloudflare WASM Imports: `/docs/guides/cloudflare-wasm-imports`
  - Cloudflare + GitHub Actions: `/docs/guides/cloudflare-github-actions-setup`

API
- API Index: `/docs/api/`
- Passkey Manager, WebAuthn Manager, React Components, Client, Server

Implementation Note: update `examples/tatchi-docs/src/.vitepress/config.ts` sidebar order to match the above; add new items as they are created.

---

## Page-level Rewrite/Authoring Outlines

### Getting Started → Overview (new)
- Audience: new integrators
- Contents: value prop, what you get, supported stacks, minimal diagram of app ↔ wallet iframe ↔ workers; links to Install/Quickstart

### Getting Started → Configure Wallet Iframe (move/expand from guide)
- Bring essentials from `guides/wallet-iframe.md` here (config + Vite plugin + permissions policy quick notes)
- Keep the advanced tips in the Guide

### Getting Started → First Passkey (new)
- Goal: register + login button working; emit key steps with brief explanation
- React snippet; vanilla TS alternative; link to Guides → Passkeys for deep dive

### Getting Started → First Transaction (new)
- Goal: send one tx with automatic confirmation
- Show API-driven path and mention React component; link to Guides → Secure Tx Confirmation

### Concepts → Goals of the Wallet (new)
- Problems: mixing app and wallet contexts; private key exposure; inline styles/scripts risk; inconsistent credential scoping; poor UX for confirmation
- Our Goals + Principles; how success is measured (e.g., no keys on main thread, consistent passkey lists, user-presence capture)

### Concepts → Architecture Overview (revise)
- Expand handshake + channel diagram; where signing happens; when visible UI appears; hosting shape

### Concepts → Security Model (new)
- Short threat model; isolation properties; CSP design; worker memory residency; permission policy; link to repo security checklists

### Concepts → RPID Strategy
- Keep `rpid-policy.md` as overview, and link to `wallet-scoped-credentials.md` for detailed config + ROR examples

### Concepts → PRF & VRF
- Minor edits: clarify “PRF used to derive keypairs and encrypt at rest”; link to repo deep dives

### Concepts → Shamir 3‑pass (+ Rotation)
- Keep `shamir3pass.md`; ensure strict keyId and rotation cross-link is prominent

### Concepts → Nonce Manager
- Keep largely as-is

### Concepts → Confirmation UX (new)
- Explain overlay heuristics and why STEP_2 must remain visible; link to `tx-confirmation` guide and repo doc `transaction_confirmation_guide.md`

### Concepts → CSP for Lit Components
- Keep as deep dive; add a “why it matters” preface that ties back to the Security Model

---

## Mapping: Existing → New Structure

- Getting Started
  - Install → keep (`getting-started/install.md`)
  - Quickstart → keep (`getting-started/quickstart.md`)
  - Configure Wallet Iframe → new, source content from `guides/wallet-iframe.md` (keep Guide for advanced tips)
  - First Passkey → new, source snippets from `guides/passkeys.md`
  - First Transaction → new, source snippets from `guides/tx-confirmation.md`
- Concepts
  - Goals of the Wallet → new (author)
  - Wallet Iframe Architecture → keep (`concepts/wallet-iframe-architecture.md`) with minor edits
  - Security Model → new (author); link to `csp-lit-components.md` and repo checklists
  - RPID Policy → keep (`concepts/rpid-policy.md`) and keep deep dive (`concepts/wallet-scoped-credentials.md`)
  - VRF & PRF → keep (`concepts/vrf-and-prf.md`), tighten wording
  - Shamir 3‑pass → keep (`concepts/shamir3pass.md`)
  - Server Key Rotation → keep (`concepts/shamir3pass-rotate-keys.md`)
  - Nonce Manager → keep (`concepts/nonce-manager.md`)
  - Confirmation UX → new (author)
  - CSP for Lit Components → keep (`concepts/csp-lit-components.md`)
- Guides
  - Passkeys → keep (`guides/passkeys.md`)
  - Secure Tx Confirmation → keep (`guides/tx-confirmation.md`)
  - Wallet Iframe → keep (`guides/wallet-iframe.md`), trim basics to Getting Started page
  - Device Linking → fill in (migrate)
  - Relay Server → expand using repo docs; include endpoint table
  - Cloudflare Worker → fill in (migrate from `examples/vite-docs` / `docs/deployment`)
  - Cloudflare WASM Imports → fill in (migrate from `docs/deployment/cloudflare-wasm-imports.md`)
  - Cloudflare + GitHub Actions → fill in (migrate from `docs/deployment/cloudflare-github-actions-setup.md`)

---

## Concrete Tasks & Owners

1) Getting Started
- Create `overview.md`, `wallet-iframe.md` (GS), `first-passkey.md`, `first-transaction.md`, `next-steps.md`
- Update Quickstart to forward-link to “Configure Wallet Iframe”

2) Concepts
- Author `goals.md` and `security-model.md`
- Author `confirmation-ux.md` (extract from tx-confirmation guide and repo doc)
- Light edits to `wallet-iframe-architecture.md`, `vrf-and-prf.md`

3) Guides
- Migrate Cloudflare + CI content from `docs/deployment/*` into the Guides section
- Flesh out `relay-server.md`, `device-linking.md` with real content

4) Nav/Sidebar
- Update `examples/tatchi-docs/src/.vitepress/config.ts` to match the structure above

5) Cross-links & Redirects
- After moving basics from Guides into Getting Started, ensure guides retain deep links and add “See Getting Started for…”.

6) Source-of-truth Bridging
- Link deeper repository docs where appropriate (e.g., VRF challenges, transaction confirmation guide, security checklists). Prefer “curated summary here; deep dive in repo”.

---

## Style & Quality Bar

- Audience-first ordering: show value quickly, progress the reader from 0 → 1 in ≤15 minutes
- Keep code runnable and minimal; React first, vanilla alternative inline
- Keep CSP considerations explicit when relevant; avoid inline styles in examples
- Use consistent titles and link slugs; avoid duplicates
- Prefer short paragraphs and bulleted lists; add callouts for browser caveats (Safari ROR)

---

## Milestones

Phase 1 — Structure and stubs (1 day)
- Add new pages as stubs with 2–4 bullets each; update sidebar; move basic snippets

Phase 2 — Fill key gaps (1–2 days)
- Write Goals, Security Model, Confirmation UX
- Migrate Cloudflare WASM Imports and GitHub Actions guides

Phase 3 — Polish and validate (1 day)
- Click-through audit of onboarding; ensure every “Next” link works
- Consistency pass on titles and anchors; add search keywords

Success Criteria
- A new dev can install, configure wallet, register a passkey, log in, and send a transaction in ≤15 minutes following Getting Started
- Concepts read as a narrative; advanced readers can jump to deep dives without dead-ends

---

## Open Questions

- Should “Header plugins and server setup for non‑Vite stacks” be surfaced as a Guide? If yes, add under Deployment.
- Do we want a “Web Components” quickstart alongside React? If so, add to Getting Started → Quickstart as a sub-section.
- Keep both `rpid-policy` and `wallet-scoped-credentials` pages, or merge into one? Proposal: keep both (overview + deep dive) for better scannability.
