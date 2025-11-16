#!/bin/bash

# Development build script for @tatchi-xyz/sdk
# - Faster build (no wasm-pack --release, no bun --minify)
# - Rolldown runs without forcing NODE_ENV=production

set -e

source ./build-paths.sh

echo "Starting development build for @tatchi-xyz/sdk..."

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

print_step "Building WASM signer worker (dev)..."
cd "$SOURCE_WASM_SIGNER"
if wasm-pack build --target web --out-dir pkg; then print_success "WASM signer worker built"; else print_error "WASM signer build failed"; exit 1; fi
cd ../..

print_step "Building WASM VRF worker (dev)..."
cd "$SOURCE_WASM_VRF"
if wasm-pack build --target web --out-dir pkg; then print_success "WASM VRF worker built"; else print_error "WASM VRF build failed"; exit 1; fi
cd ../..

print_step "Building TypeScript..."
if npx tsc -p tsconfig.build.json; then print_success "TypeScript compilation completed"; else print_error "TypeScript compilation failed"; exit 1; fi

print_step "Generating CSS variables from palette.json (w3a-components.css)..."
if node ./scripts/generate-w3a-components-css.mjs; then print_success "w3a-components.css generated"; else print_error "Failed to generate w3a-components.css"; exit 1; fi

print_step "Bundling with Rolldown (dev)..."
if npx rolldown -c rolldown.config.ts; then print_success "Rolldown bundling completed"; else print_error "Rolldown bundling failed"; exit 1; fi

print_step "Bundling workers with Bun (dev, no minify)..."
if [ -z "$BUN_BIN" ]; then print_error "Bun not found. Install Bun or ensure it is on PATH."; exit 1; fi
if "$BUN_BIN" build "$SOURCE_CORE/web3authn-signer.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser \
  && "$BUN_BIN" build "$SOURCE_CORE/web3authn-vrf.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser \
  && "$BUN_BIN" build "$SOURCE_CORE/OfflineExport/offline-export-sw.ts" --outdir "$BUILD_WORKERS" --format esm --target browser; then
  print_success "Bun worker bundling completed"
else
  print_error "Bun worker bundling failed"; exit 1
fi

print_step "Copying worker WASM binaries next to worker JS..."
mkdir -p "$BUILD_WORKERS"
if cp "$SOURCE_WASM_VRF/pkg/wasm_vrf_worker_bg.wasm" "$BUILD_WORKERS/" 2>/dev/null; then print_success "VRF WASM copied"; else print_warning "VRF WASM not found"; fi
if cp "$SOURCE_WASM_SIGNER/pkg/wasm_signer_worker_bg.wasm" "$BUILD_WORKERS/" 2>/dev/null; then print_success "Signer WASM copied"; else print_warning "Signer WASM not found"; fi

print_success "Development build completed successfully!"
