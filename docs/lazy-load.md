# SDK Lazy‑Load Plan

This document captures a concrete, incremental plan to make the SDK fast‑by‑default via native lazy loading, smaller first chunks, and opt‑in warming. It is scoped to client builds (React + iframe host + workers), without changing public APIs unless noted.

## Goals

- Reduce initial JS shipped to apps that import `@tatchi-xyz/sdk/react`.
- Make heavy features (wallet iframe, workers/WASM, viem/chainsig) load on demand.
- Keep styles correct for Shadow DOM and portaled UI without requiring app hacks.
- Preserve backwards compatibility and provide clear migration paths.

## Pain Points Today

- Aggregator imports pull in more than needed (e.g., `sdk/src/react/index.ts` → `@/index`).
- Wallet iframe initializes eagerly in context provider.
- Workers/WASM may be warmed when not needed.
- CSS is provided as a single "all‑in" sheet; consumers can’t easily tree‑shake it.

## Strategy (High Level)

- Split exports into leaf entry points to enable granular imports and chunking.
- Move heavy code behind dynamic `import()` boundaries.
- Add provider/config flags to opt‑in to warming; default to lazy.
- Ship per‑component CSS (keep an aggregated sheet for convenience).
- Keep ShadowRoot styles for isolation, plus optional global CSS injection for portaled UI.

## Deliverables

- New package exports and leaf entry points for React components and helpers.
- Eager → lazy runtime changes (iframe init, workers, chainsigs) guarded by flags.
- Updated docs and examples demonstrating lazy usage.
- Perf budgets and CI checks for bundle size regressions.

## Phased Plan

### Phase 1 — Packaging & Entry Points (safe)

- Add leaf exports in `sdk/package.json`:
  - `./react/profile` → ProfileSettingsButton (+ CSS)
  - `./react/passkey-auth-menu` → PasskeyAuthMenu (+ CSS)
  - `./react/embedded` → SendTxButtonWithTooltip (+ CSS)
  - `./react/provider` → TatchiPasskeyProvider (minimal deps)
  - Keep `./react` aggregator for compatibility.
- Mark package `sideEffects: false` (already set) and ensure CSS files are marked as side effects only where needed (see CSS section).
- Acceptance:
  - Can import leaf entries without pulling unrelated code.
  - Tree‑shaking verified via local build size reports.

Files to touch:
- `sdk/package.json` (exports, sideEffects overrides for CSS if required)
- `sdk/src/react/*` (create index files for new leaf entries)

### Phase 2 — Context/Manager Import Hygiene (safe)

- In `sdk/src/react/context/index.tsx`, replace aggregator import `@/index` with direct minimal imports (`@/core/TatchiPasskey`, types). Avoid pulling server/extra modules.
- Ensure no top‑level calls (e.g., pre‑init) happen at import time.
- Acceptance:
  - Importing context/provider does not inflate chunk unexpectedly.

Files to touch:
- `sdk/src/react/context/index.tsx`

### Phase 3 — Wallet Iframe Init → On‑Demand (medium)

- In `TatchiPasskey.initWalletIframe()`, dynamically import the router:
  - `const { WalletIframeRouter } = await import('../WalletIframe/client/router')`.
- Add config flag `iframeWallet.eagerInit?: boolean` (default false).
  - When false: do not call `initWalletIframe()` in provider mount. Initialize on first feature that requires it (e.g., SendTx button, Profile menu Device Linking, or explicit `tatchi.initWalletIframe()` call).
  - When true: pre‑init as today (for apps that prefer readiness).
- Provide `tatchi.prewarm({ iframe?: boolean })` helper that defers with `requestIdleCallback`.
- Acceptance:
  - No iframe client code in the first chunk unless used or eagerInit=true.

Files to touch:
- `sdk/src/core/TatchiPasskey/index.ts`
- `sdk/src/react/context/index.tsx` (remove eager init on mount, or gate behind flag)

### Phase 4 — Workers & WASM (medium)

- Ensure worker entry points and WASM init paths are only imported inside the handlers that need them.
- Add explicit `prewarmWorkers` helper that calls existing warmers behind idle.
- Add `prewarm({ workers: true })` alias on the manager.
- Acceptance:
  - No worker/WASM code in the initial chunk unless a feature requires it or prewarmed.

Files to review/touch:
- `sdk/src/core/sdkPaths/workers.ts`
- `sdk/src/core/sdkPaths/wasm-loader.ts` (already robust; only ensure call sites are lazy)
- `sdk/src/core/WebAuthnManager/*` handlers (import boundaries)

### Phase 5 — Chainsigs/Viem Split (medium)

- Create an optional helper entry: `@tatchi-xyz/sdk/chainsigs` that dynamically imports `viem`/`chainsig.js`.
- Update examples to import from this helper so main React bundles don’t include these deps unless required.
- Acceptance:
  - Without chainsigs usage, no viem/chainsig code is present in baseline bundle.

Files to add/touch:
- `sdk/src/chainsigs/index.ts` (dynamic import wrapper)
- `sdk/package.json` (export)

### Phase 6 — CSS Strategy (safe)

- Keep `./react/styles` (aggregated) for convenience.
- Also ship per‑component CSS colocated with leaf entries (already done for most). Ensure they are imported by their leaf entry `index.ts` so bundlers include only what’s used.
- For portaled UI (Profile menu, toasts), provide a small utility `injectGlobalStylesOnce(css: string, id: string)` and document calling it when apps render inside ShadowRoot.
- Acceptance:
  - Apps can rely on component CSS without importing the whole sheet.

Files to touch:
- `sdk/src/react/components/**/index.tsx` (ensure each imports its CSS)
- Optional util: `sdk/src/react/utils/css.ts`

### Phase 7 — Provider Ergonomics (safe)

- Add `eager?: boolean` prop on `TatchiPasskeyProvider` (default false) to control warmers.
- Wire provider to call `tatchi.prewarm({ iframe: true, workers: true })` on idle when eager=true.
- Acceptance:
  - Consumers can toggle eagerness without changing app code.

Files to touch:
- `sdk/src/react/context/TatchiPasskeyProvider.tsx`

### Phase 8 — Docs & Examples (safe)

- Update docs to recommend leaf imports and lazy usage patterns:
  - React.lazy around heavy components.
  - Opt‑in to `eager` for apps that prefer readiness.
  - Demonstrate `tatchi.prewarm()` on idle.
- Update examples (vite/next/vue/svelte) to use leaf entries where applicable.
- Acceptance:
  - Clear guidance and working examples for lazy usage.

Files to touch:
- `examples/*` pages/components
- Docs pages (Getting Started, React Components)

## Testing & Validation

- Build size budgets:
  - Add `pnpm run size:report` that prints top chunks and their sizes. Check in CI.
  - Add threshold job that fails on >10% regression of initial chunk.
- Runtime tests:
  - E2E flows still pass (existing Playwright tests).
  - Verify theme/portals still styled with per‑component CSS.
  - Verify iframe/worker init on first use.

## Rollout Plan

1) Land Phase 1 + 2 (packaging + hygiene).
2) Land Phase 3 + 4 behind flags (eager=false default). Keep previous eager behavior with `eager=true`.
3) Land Phase 5 (chainsigs split) and update examples.
4) Land CSS adjustments and provider ergonomics.
5) Update docs + publish changelog with migration notes.

## Backwards Compatibility

- Keep `./react` aggregator as-is; no breaking changes to names.
- Default behavior remains compatible, but with less eager work. Apps that rely on early readiness can set `eager=true`.
- Deprecated patterns: importing `@tatchi-xyz/sdk/react/styles` globally is still supported but no longer required for most components.

## Risks & Mitigations

- Risk: unexpected runtime init order (iframe/worker) under lazy.
  - Mitigate with `eager` flag and `tatchi.prewarm()` helper, plus E2E verification.
- Risk: CSS scoping for portaled UI in ShadowRoots.
  - Provide `injectGlobalStylesOnce` helper and document usage.
- Risk: bundler edge cases for dynamic imports.
  - Validate with Vite/Rollup/Rolldown + Next.js. Add test harness and size reports.

## Example Usage (After Changes)

```tsx
// Leaf imports
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'
import { ProfileSettingsButton } from '@tatchi-xyz/sdk/react/profile'

// Lazy heavy components
const PasskeyAuthMenu = React.lazy(() => import('@tatchi-xyz/sdk/react/passkey-auth-menu'))

export function App() {
  return (
    <TatchiPasskeyProvider config={cfg} theme={{ mode: 'provider+scope' }} eager={false}>
      <ProfileSettingsButton />
      <React.Suspense fallback={null}>
        <PasskeyAuthMenu />
      </React.Suspense>
    </TatchiPasskeyProvider>
  )
}

// Optional prewarm on idle
useEffect(() => {
  const idle = (cb: () => void) => ('requestIdleCallback' in window)
    ? (window as any).requestIdleCallback(cb, { timeout: 1500 })
    : setTimeout(cb, 600)
  idle(() => tatchi.prewarm({ iframe: true, workers: true }))
}, [])
```

---

Owner: SDK team
Status: Draft
Last updated: YYYY‑MM‑DD

