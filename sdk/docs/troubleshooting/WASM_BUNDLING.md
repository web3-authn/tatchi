# WASM Bundling Issue: Missing Export

## Root Cause

Rolldown bundles WASM into embedded bundles (`wallet-iframe-host.js`) and auto-generates initialization calls based on package name: `init_wasm_signer_worker()`. The WASM module only exported `init_worker()`, causing:

```
SyntaxError: ... does not provide an export named 'init_wasm_signer_worker'
```

Only affects embedded bundles because `embeddedExternal: []` is empty. Regular ESM/CJS builds externalize WASM.

## Fix

**Rust export alias** (`src/wasm_signer_worker/src/lib.rs`):
```rust
#[wasm_bindgen]
pub fn init_worker() { /* ... */ }

#[wasm_bindgen(js_name = "init_wasm_signer_worker")]
pub fn init_wasm_signer_worker() {
    init_worker();
}
```

**Config externalization** (`rolldown.config.ts`):
```typescript
const external = [
  /wasm_signer_worker\.js$/,
  /wasm_vrf_worker\.js$/,
];
```

**Test coverage**: `src/__tests__/unit/wasm-exports.test.ts` verifies exports exist.
