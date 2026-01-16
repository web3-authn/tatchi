# Server WASM Worker (proposal)

We currently ship two Rust/WASM packages that are used in both browser clients and server/relayer runtimes:

- `sdk/src/wasm_signer_worker` (signer, NEAR tx building/signing, threshold client coordination, plus some threshold *server helpers*)
- `sdk/src/wasm_vrf_worker` (VRF/session logic, Shamir 3-pass client logic, plus some Shamir *server helpers*)

Because WASM binaries can’t be tree-shaken like JS, any exported/linked code that lives in these crates is shipped to the browser even if the browser never calls it. This doc inventories what can be split into a server-only WASM “bundle” (or new `server-wasm-worker`) so client builds can omit relayer/server-only logic.

## Goals

- Reduce browser `.wasm` bytes by compiling out server/relayer-only exports and the code only reachable from them.
- Keep server-side ergonomics: Node + Cloudflare Workers should still be able to import WASM helpers.
- Support E2E tests: server-side WASM can be a **superset** (include both client + server exports) so tests can run the full protocol in one runtime.
- Avoid breaking API contracts (request/response shapes, `WorkerRequestType` numeric IDs, etc).

## Current usage (what loads WASM where)

### Signer WASM (`wasm_signer_worker`)

- **Browser** loads `wasm_signer_worker_bg.wasm` via `sdk/src/core/web3authn-signer.worker.ts` and calls:
  - `handle_signer_message(...)` (main entrypoint)
  - `attach_wrap_key_seed_port(...)` (MessagePort bridge)
- **Server** loads the same WASM for multiple reasons:
  - `sdk/src/server/core/AuthService.ts` uses `handle_signer_message(...)` for server-side signing flows.
  - `sdk/src/server/core/ThresholdService/*` imports threshold helper exports directly from `wasm_signer_worker`:
    - keygen helpers: `sdk/src/server/core/ThresholdService/keygenStrategy.ts`
    - signing helpers: `sdk/src/server/core/ThresholdService/signingHandlers.ts`
    - digest helpers: `sdk/src/server/core/ThresholdService/ThresholdSigningService.ts`

### VRF WASM (`wasm_vrf_worker`)

- **Browser** loads `wasm_vrf_worker_bg.wasm` via `sdk/src/core/web3authn-vrf.worker.ts` and calls:
  - `handle_message(...)` (main entrypoint)
  - `attach_wrap_key_seed_port(...)` (MessagePort bridge)
  - Shamir 3-pass **client** handlers (encrypt/decrypt VRF keypair) are exercised through `handle_message(...)`.
- **Server** currently uses VRF WASM primarily for Shamir 3-pass **server** helpers:
  - `sdk/src/server/core/shamirWorker.ts` calls `handle_message(...)` with:
    - `SHAMIR3PASS_GENERATE_SERVER_KEYPAIR`
    - `SHAMIR3PASS_APPLY_SERVER_LOCK_KEK`
    - `SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK`

## What can be split into a server-wasm-worker

This section is intentionally concrete: it lists the files/exports that are clearly “server-only” today.

### From `sdk/src/wasm_signer_worker` (threshold Ed25519 relayer helpers)

**Server-only exports (safe to move behind a `server` build / server-only crate):**

- `sdk/src/wasm_signer_worker/src/threshold/threshold_frost.rs`
  - `threshold_ed25519_keygen_from_client_verifying_share(...)`
  - `threshold_ed25519_keygen_from_master_secret_and_client_verifying_share(...)`
  - `threshold_ed25519_round1_commit(...)`
  - `threshold_ed25519_round2_sign(...)`
  - `threshold_ed25519_round2_sign_cosigner(...)`

These are only imported by server code (see `sdk/src/server/core/ThresholdService/*`) and are not called from the browser worker entrypoint.

**Important shared code to keep available to client builds:**

- `sdk/src/wasm_signer_worker/src/threshold/threshold_frost.rs` also contains:
  - `compute_threshold_ed25519_group_public_key_2p_from_verifying_shares(...)`

This helper is used by client-facing signing flows (e.g. `SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT` handler) so if `threshold_frost.rs` is split, this function should be extracted to a shared module (or duplicated) that remains in the client build.

**Likely server-only exports (currently used by server + tests, not by browser code):**

- `sdk/src/wasm_signer_worker/src/threshold/threshold_digests.rs`
  - `threshold_ed25519_compute_near_tx_signing_digests(...)`
  - `threshold_ed25519_compute_delegate_signing_digest(...)`
  - `threshold_ed25519_compute_nep413_signing_digest(...)`

These are imported by `sdk/src/server/core/ThresholdService/ThresholdSigningService.ts` and by E2E tests, but there are no client imports in `sdk/src/core/*`.

### From `sdk/src/wasm_vrf_worker` (Shamir 3-pass relayer helpers)

**Server-only handler implementations:**

- `sdk/src/wasm_vrf_worker/src/handlers/handle_shamir3pass_server.rs`
  - `Shamir3PassGenerateServerKeypair*`
  - `Shamir3PassApplyServerLock*`
  - `Shamir3PassRemoveServerLock*`

These are only exercised by server code via `sdk/src/server/core/shamirWorker.ts`.

**Server-only WASM-exported HTTP shapes (TypeScript convenience types):**

- `sdk/src/wasm_vrf_worker/src/types/http.rs`
  - `ShamirApplyServerLockHTTPRequest/Response`
  - `ShamirRemoveServerLockHTTPRequest/Response`

Server TS types are derived from these in `sdk/src/server/core/types.ts`. The browser does not appear to import these types.

## Proposed structure: server WASM as a superset “bundle”

There are two viable interpretations of “server-wasm-worker”.

### Option A (recommended): server WASM is a **bundle** (multiple `.wasm` files)

Keep `wasm_signer_worker` and `wasm_vrf_worker` as separate WASM modules (matching today’s runtime split), but produce **two builds** of each:

- **Client build**: excludes relayer/server-only exports/handlers.
- **Server build**: superset build that includes client + server exports (useful for E2E tests and server runtime).

This avoids hard problems with a single combined WASM module (see Option B).

Implementation sketch:

- Add cargo features to each crate:
  - `wasm_signer_worker`
    - `feature = "server_threshold_exports"` gates the `threshold_ed25519_*` relayer helper exports and (optionally) `threshold_digests` exports.
  - `wasm_vrf_worker`
    - `feature = "server_shamir"` gates Shamir server handlers + the Shamir HTTP types in `types/http.rs`.
- Build outputs to different `pkg` directories (or different filenames) so the browser imports only the client build.
- Point server imports at the server build (Cloudflare can continue to import via `sdk/src/server/wasm/*` re-export modules).

Compatibility note:

- Prefer **not** renumbering `WorkerRequestType` values; if you gate out handler code, return a clear error for unsupported request types in the client build rather than removing enum variants.

### Option B: a single combined `server-wasm-worker` `.wasm` (superset of both workers)

This is possible, but requires refactors:

- Export name conflicts: both current crates export `attach_wrap_key_seed_port`.
- `#[wasm_bindgen(start)]` conflicts: `wasm_vrf_worker` defines a start function; combining crates tends to require a single start entry.
- You’d need a third “umbrella” crate that depends on shared “core” crates (no wasm-bindgen), and then defines the WASM exports in one place.

If the main motivation is E2E testing, Option A typically achieves the same goal with much less risk.

## Where the server bundle should live

We already have a server-facing import surface in `sdk/src/server/wasm/`:

- `sdk/src/server/wasm/signer.ts` re-exports the **server** signer WASM binary (proposed: `wasm_server_signer_worker_bg.wasm`)
- `sdk/src/server/wasm/vrf.ts` re-exports the **server** VRF WASM binary (proposed: `wasm_server_vrf_worker_bg.wasm`)

The “server-wasm-worker” bundle can extend this pattern by pointing these re-exports at the **server build** of each WASM module (the superset build), while the browser worker loaders point at the **client build**.

## Expected bundle-size impact

Splitting exports only reduces size if it allows the compiler/wasm-opt to drop code that is **only reachable** from those exports/handlers.

- Removing server-only Shamir handlers from the VRF WASM may have limited impact because the Shamir math is already needed for client-side encrypt/decrypt flows.
- Removing server-only threshold helper exports may have limited impact if the browser still needs FROST for threshold client signing.
- The biggest client-size wins usually come from feature-gating entire subsystems (e.g. compile out threshold signing entirely for apps that only use the local signer).

### Verified size deltas (client vs server variants)

Measurements from the current dual-build setup (`pkg/` = client, `pkg-server/` = server superset):

- **Signer `.wasm`**: `714,776` → `661,851` bytes raw (`-52,925`, ~51.7 KiB, ~7.4%), `282,993` → `263,328` bytes gzip (`-19,665`, ~19.2 KiB, ~6.9%)
- **VRF `.wasm`**: `351,423` → `345,140` bytes raw (`-6,283`, ~6.1 KiB, ~1.8%), `138,387` → `137,228` bytes gzip (`-1,159`, ~1.1 KiB, ~0.8%)

Takeaway: size win is **modest**; the refactor is mainly justified by **auditable boundary correctness**.

### Verified build-time delta (`pnpm build:sdk`)

Warm-cache timing on this machine:

- **Baseline (single WASM build per worker)**: `real 28.04s`
- **After split (client + server variants)**: `real 65.76s` (~2.35× slower)

Root cause: `build:sdk` now runs `wasm-pack` for both `pkg/` and `pkg-server/` in `generate-types.sh`, and again for both in `build-dev.sh`.

## Phased TODO list (strict client/server WASM separation)

This checklist assumes **Option A** (two builds per worker): `pkg/` is **client**, `pkg-server/` is **server superset**.

### Phase 0 — Invariants + acceptance criteria

- [ ] Freeze browser asset names: keep `wasm_signer_worker_bg.wasm` + `wasm_vrf_worker_bg.wasm` stable in `sdk/dist/workers/` (preconnect/offline paths rely on them).
- [ ] Confirm “no server-only logic in client” policy:
  - client build must not export threshold relayer helpers or Shamir server helpers
  - server build may export both client + server helpers (superset) for relayer + E2E
- [ ] Add a simple “export set” check (script/CI) that fails if client builds contain server-only exports.
- [ ] Measure current **VRF** worker delta after gating (expected smaller; verify).

### Phase 1 — Rust feature gates (WASM signer worker)

- [ ] Flip feature defaults so **client build is default**:
  - `sdk/src/wasm_signer_worker/Cargo.toml`: make server features **opt-in** (current gating was added for measurement but defaults may need to flip).
- [ ] Gate server-only wasm-bindgen exports behind a feature (name example: `server_threshold_exports`):
  - `sdk/src/wasm_signer_worker/src/threshold/threshold_frost.rs` relayer helpers:
    - `threshold_ed25519_keygen_from_client_verifying_share`
    - `threshold_ed25519_keygen_from_master_secret_and_client_verifying_share`
    - `threshold_ed25519_round1_commit`
    - `threshold_ed25519_round2_sign`
    - `threshold_ed25519_round2_sign_cosigner`
  - `sdk/src/wasm_signer_worker/src/threshold/threshold_digests.rs` digest helpers:
    - `threshold_ed25519_compute_near_tx_signing_digests`
    - `threshold_ed25519_compute_delegate_signing_digest`
    - `threshold_ed25519_compute_nep413_signing_digest`
- [ ] Ensure shared/client-needed helpers stay in the client build (extract if needed):
  - `compute_threshold_ed25519_group_public_key_2p_from_verifying_shares`

### Phase 2 — Rust feature gates (WASM VRF worker)

- [ ] Add a server-only feature in `sdk/src/wasm_vrf_worker/Cargo.toml` (name example: `server_shamir_exports`).
- [ ] Gate server-only Shamir handler implementations:
  - `sdk/src/wasm_vrf_worker/src/handlers/handle_shamir3pass_server.rs`
- [ ] Gate server-only HTTP shapes (and anything only reachable from them):
  - `sdk/src/wasm_vrf_worker/src/types/http.rs`
- [ ] Keep `WorkerRequestType` numeric IDs stable:
  - do **not** `cfg` out enum variants; instead return a clear “unsupported in client build” error in `handle_message(...)` when server-only request types are received.

### Phase 3 — Dual wasm-pack outputs (`pkg/` + `pkg-server/`)

- [ ] Standardize output directories for both crates:
  - client build: `sdk/src/wasm_{signer,vrf}_worker/pkg/`
  - server build: `sdk/src/wasm_{signer,vrf}_worker/pkg-server/`
- [ ] Name the **server signer** wasm-pack output `wasm_server_signer_worker`:
  - outputs: `pkg-server/wasm_server_signer_worker.js`, `pkg-server/wasm_server_signer_worker_bg.wasm`, `pkg-server/wasm_server_signer_worker.d.ts`
- [ ] Name the **server VRF** wasm-pack output `wasm_server_vrf_worker`:
  - outputs: `pkg-server/wasm_server_vrf_worker.js`, `pkg-server/wasm_server_vrf_worker_bg.wasm`, `pkg-server/wasm_server_vrf_worker.d.ts`
- [ ] Update `sdk/scripts/generate-types.sh` to build **both** outputs:
  - build client `pkg/` (no server features)
  - build server `pkg-server/` (server features on)
  - keep `npx tsc --noEmit -p tsconfig.build.json` validation
- [ ] Update `sdk/scripts/build-dev.sh` + `sdk/scripts/build-prod.sh`:
  - build both `pkg/` and `pkg-server/` for signer + vrf
  - run `node ./scripts/fix-wasm-pack-sideeffects.mjs` for **all** generated `pkg*` dirs
  - copy only **client** `.wasm` from `pkg/` into `sdk/dist/workers/`

### Phase 4 — Update SDK imports (server uses `pkg-server/`)

- [ ] Switch server code imports to the server build:
  - `sdk/src/server/core/AuthService.ts` → `../../wasm_signer_worker/pkg-server/wasm_server_signer_worker.js`
  - `sdk/src/server/core/ThresholdService/keygenStrategy.ts` → `../../../wasm_signer_worker/pkg-server/wasm_server_signer_worker.js`
  - `sdk/src/server/core/ThresholdService/signingHandlers.ts` → `../../../wasm_signer_worker/pkg-server/wasm_server_signer_worker.js`
  - `sdk/src/server/core/ThresholdService/ThresholdSigningService.ts` → `../../../wasm_signer_worker/pkg-server/wasm_server_signer_worker.js`
  - `sdk/src/server/core/shamirWorker.ts` → `../../wasm_vrf_worker/pkg-server/wasm_server_vrf_worker.js`
  - `sdk/src/server/core/types.ts` → import Shamir HTTP/request types from `../../wasm_vrf_worker/pkg-server/wasm_server_vrf_worker.js`
- [ ] Update server-side wasm URL resolution to prefer `pkg-server/` wasm binaries:
  - `sdk/src/server/core/AuthService.ts`: update `SIGNER_WASM_MAIN_PATH` (and consider whether a fallback to client `dist/workers/` is desirable when server-only features are enabled)
  - `sdk/src/server/core/shamirWorker.ts`: update `VRF_WASM_MAIN_PATH`
- [ ] Keep all client/browser imports pointing to `pkg/` (no changes expected in `sdk/src/core/*`).

### Phase 5 — Update build outputs (rolldown emits both pkgs)

- [ ] Update `sdk/rolldown.config.ts`:
  - keep existing `src/wasm_{signer,vrf}_worker/pkg/*` build entries → `sdk/dist/esm/wasm_{signer,vrf}_worker/pkg/*`
  - add new build entries for `src/wasm_{signer,vrf}_worker/pkg-server/*` → `sdk/dist/esm/wasm_{signer,vrf}_worker/pkg-server/*`
  - copy `*_bg.wasm` for both outputs (similar to existing `copyWasmAsset(...)` plugin)
- [ ] Decide what to do for CJS:
  - either add analogous `dist/cjs/wasm_{signer,vrf}_worker/pkg*` wasm copies (current CJS `server/wasm/*.js` requires a wasm path that may not exist)
  - or explicitly document/limit wasm support to ESM-only server entrypoints

### Phase 6 — Wire server wasm import surface + deployments

- [ ] Update `sdk/src/server/wasm/signer.ts` + `sdk/src/server/wasm/vrf.ts` to re-export **server** wasm binaries from `pkg-server/`.
- [ ] Verify Cloudflare Worker builds still bundle the referenced server wasm assets.
- [ ] Verify wallet iframe deploy remains client-only:
  - `.github/workflows/deploy-wallet-iframe-prod.yml` should continue to ship `sdk/dist/workers/*` + `sdk/dist/esm/sdk/*` only (and not `sdk/dist/esm/wasm_*_worker/*`).

### Phase 7 — Guardrails + verification

- [ ] Add a small verification script (Node) that checks for presence/absence of server-only JS exports in the generated glue:
  - client `pkg/wasm_signer_worker.js` must NOT export `threshold_ed25519_round1_commit`, etc.
  - server `pkg-server/wasm_server_signer_worker.js` MUST export them.
  - same pattern for VRF Shamir server exports/types via `pkg-server/wasm_server_vrf_worker.js`.
- [ ] Run existing SDK tests with both “local signer” and “threshold enabled” configurations:
  - ensure relayer builds use server wasm and browser builds use client wasm
- [ ] Re-measure `.wasm` sizes after fully gating VRF + any remaining server-only signer bits; update this doc with final numbers.
