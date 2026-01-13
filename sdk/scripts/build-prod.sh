#!/bin/bash

# Production build script for @tatchi-xyz/sdk
# - Builds WASM in release mode (wasm-pack --release)
# - Bundles with rolldown in NODE_ENV=production (better treeshaking, prod React)
# - Minifies worker JS via Bun

set -e

source ./build-paths.sh

echo "Starting production build for @tatchi-xyz/sdk..."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}📦 $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }

if command -v bun >/dev/null 2>&1; then BUN_BIN="$(command -v bun)"; elif [ -x "$HOME/.bun/bin/bun" ]; then BUN_BIN="$HOME/.bun/bin/bun"; else BUN_BIN=""; fi

print_step "Cleaning previous build artifacts..."
rm -rf "$BUILD_ROOT/"
print_success "Build directory cleaned"

print_step "Generating TypeScript types from Rust..."
if ./scripts/generate-types.sh; then print_success "TypeScript types generated successfully"; else print_error "Type generation failed"; exit 1; fi

print_step "Building WASM signer worker (release)..."
cd "$SOURCE_WASM_SIGNER"
if wasm-pack build --target web --out-dir pkg --release; then print_success "WASM signer worker built"; else print_error "WASM signer build failed"; exit 1; fi
cd ../..

print_step "Building WASM VRF worker (release)..."
cd "$SOURCE_WASM_VRF"
if wasm-pack build --target web --out-dir pkg --release; then print_success "WASM VRF worker built"; else print_error "WASM VRF build failed"; exit 1; fi
cd ../..

print_step "Optimizing wasm-pack metadata for tree-shaking..."
if node ./scripts/fix-wasm-pack-sideeffects.mjs "$SOURCE_WASM_SIGNER/pkg" "$SOURCE_WASM_VRF/pkg"; then
  print_success "WASM package metadata optimized"
else
  print_warning "Failed to optimize WASM package metadata; bundler may deoptimize tree-shaking"
fi

print_step "Building TypeScript..."
if npx tsc -p tsconfig.build.json; then print_success "TypeScript compilation completed"; else print_error "TypeScript compilation failed"; exit 1; fi

print_step "Generating CSS variables from palette.json (w3a-components.css)..."
if node ./scripts/generate-w3a-components-css.mjs; then print_success "w3a-components.css generated"; else print_error "Failed to generate w3a-components.css"; exit 1; fi

print_step "Bundling with Rolldown (production)..."
if NODE_ENV=production npx rolldown -c rolldown.config.ts --minify; then print_success "Rolldown bundling completed"; else print_error "Rolldown bundling failed"; exit 1; fi

print_step "Restoring wasm-pack JS glue (rolldown --minify breaks serde_wasm_bindgen parsing)..."
# Rolldown's minifier can corrupt wasm-bindgen generated JS glue code, causing runtime errors like:
#   "Invalid payload for SIGN_TRANSACTION_WITH_KEYPAIR: invalid type: JsValue(Object(...)), expected struct ..."
# Fix: keep Rolldown minification for SDK bundles, but ship the original wasm-pack JS for the WASM worker pkgs.
mkdir -p "$BUILD_ESM/wasm_signer_worker/pkg" "$BUILD_ESM/wasm_vrf_worker/pkg"
cp "$SOURCE_WASM_SIGNER/pkg/wasm_signer_worker.js" "$BUILD_ESM/wasm_signer_worker/pkg/wasm_signer_worker.js"
cp "$SOURCE_WASM_VRF/pkg/wasm_vrf_worker.js" "$BUILD_ESM/wasm_vrf_worker/pkg/wasm_vrf_worker.js"
print_success "WASM JS glue restored"

print_step "Sanity check: signer WASM can parse SIGN_TRANSACTION_WITH_KEYPAIR payload..."
node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import initSignerWasm, { handle_signer_message, WorkerRequestType } from './dist/esm/wasm_signer_worker/pkg/wasm_signer_worker.js';

const wasmBytes = readFileSync('./dist/esm/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm');
const ab = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength);
const module = await WebAssembly.compile(ab);
await initSignerWasm({ module_or_path: module });

const nearPrivateKey = `ed25519:${bs58.encode(randomBytes(64))}`;
const blockHash = bs58.encode(randomBytes(32));
const msg = {
  type: WorkerRequestType.SignTransactionWithKeyPair,
  payload: {
    nearPrivateKey,
    signerAccountId: 'w3a-relayer.testnet',
    receiverId: 'someone.testnet',
    nonce: '1',
    blockHash,
    actions: [{ action_type: 'CreateAccount' }],
  },
};

const res = await handle_signer_message(msg);
if (!res || res.type !== 5 || !res.payload?.success) {
  throw new Error(`Unexpected signer response: ${JSON.stringify(res)}`);
}
NODE
print_success "Signer WASM payload parsing OK"

print_step "Bundling workers with Bun (minified)..."
if [ -z "$BUN_BIN" ]; then print_error "Bun not found. Install Bun or ensure it is on PATH."; exit 1; fi
if "$BUN_BIN" build "$SOURCE_CORE/web3authn-signer.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser --minify \
  && "$BUN_BIN" build "$SOURCE_CORE/web3authn-vrf.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser --minify \
  && "$BUN_BIN" build "$SOURCE_CORE/OfflineExport/offline-export-sw.ts" --outdir "$BUILD_WORKERS" --format esm --target browser --minify; then
  print_success "Bun worker bundling completed"
else
  print_error "Bun worker bundling failed"; exit 1
fi

print_step "Copying worker WASM binaries next to worker JS..."
mkdir -p "$BUILD_WORKERS"
if cp "$SOURCE_WASM_VRF/pkg/wasm_vrf_worker_bg.wasm" "$BUILD_WORKERS/" 2>/dev/null; then print_success "VRF WASM copied"; else print_warning "VRF WASM not found"; fi
if cp "$SOURCE_WASM_SIGNER/pkg/wasm_signer_worker_bg.wasm" "$BUILD_WORKERS/" 2>/dev/null; then print_success "Signer WASM copied"; else print_warning "Signer WASM not found"; fi

print_success "Production build completed successfully!"
