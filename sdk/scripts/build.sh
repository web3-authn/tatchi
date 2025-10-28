#!/bin/bash

# Build script for passkey package
# This script handles the complete build process including WASM compilation and TypeScript bundling

set -e

# Source build paths
source ./build-paths.sh

echo "Starting passkey package build..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}📦 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Detect Bun binary (prefer PATH, fallback to ~/.bun)
if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
elif [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
else
    BUN_BIN=""
fi

# Step 1: Clean previous build
print_step "Cleaning previous build artifacts..."
rm -rf "$BUILD_ROOT/"
print_success "Build directory cleaned"

# Step 2: Generate TypeScript types from Rust
print_step "Generating TypeScript types from Rust..."
if ./scripts/generate-types.sh; then
    print_success "TypeScript types generated successfully"
else
    print_error "Type generation failed"
    exit 1
fi

# Step 3: Build WASM signer worker
print_step "Building WASM signer worker..."
cd "$SOURCE_WASM_SIGNER"
if wasm-pack build --target web --out-dir pkg; then
    print_success "WASM signer worker built successfully"
else
    print_error "WASM signer worker build failed"
    exit 1
fi
cd ../..

# Step 4: Build WASM VRF worker
print_step "Building WASM VRF worker..."
cd "$SOURCE_WASM_VRF"
if wasm-pack build --target web --out-dir pkg; then
    print_success "WASM VRF worker built successfully"
else
    print_error "WASM VRF worker build failed"
    exit 1
fi
cd ../..

# Step 5: Build TypeScript
print_step "Building TypeScript..."
if npx tsc -p tsconfig.build.json; then
    print_success "TypeScript compilation completed"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

    # Step 6: Bundle with Rolldown
  print_step "Bundling with Rolldown..."
  if npx rolldown -c rolldown.config.ts; then
      print_success "Rolldown bundling completed"
  else
      print_error "Rolldown bundling failed"
      exit 1
  fi

# Step 7: Bundle workers with Bun (handles TypeScript better)
print_step "Bundling workers with Bun..."
if [ -z "$BUN_BIN" ]; then
    print_error "Bun not found. Install Bun or ensure it is on PATH."
    exit 1
fi
if "$BUN_BIN" build "$SOURCE_CORE/web3authn-signer.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser && \
   "$BUN_BIN" build "$SOURCE_CORE/web3authn-vrf.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser; then
  print_success "Bun worker bundling completed"
else
  print_error "Bun worker bundling failed"
  exit 1
fi

# Step 7.1: Ensure WASM binaries are colocated with worker JS for runtime fetch()
print_step "Copying worker WASM binaries next to worker JS..."
mkdir -p "$BUILD_WORKERS"
if cp "$SOURCE_WASM_VRF/pkg/wasm_vrf_worker_bg.wasm" "$BUILD_WORKERS/" 2>/dev/null; then
  print_success "VRF WASM copied to dist/workers/"
else
  print_warning "VRF WASM not found at $SOURCE_WASM_VRF/pkg/wasm_vrf_worker_bg.wasm"
fi
if cp "$SOURCE_WASM_SIGNER/pkg/wasm_signer_worker_bg.wasm" "$BUILD_WORKERS/" 2>/dev/null; then
  print_success "Signer WASM copied to dist/workers/"
else
  print_warning "Signer WASM not found at $SOURCE_WASM_SIGNER/pkg/wasm_signer_worker_bg.wasm"
fi

print_success "Build completed successfully!"

# Optional: Display build summary
echo ""
echo "Build Summary:"
echo "  - Type generation: ✅"
echo "  - WASM signer worker: ✅"
echo "  - WASM VRF worker: ✅"
echo "  - TypeScript compilation: ✅"
echo "  - Rolldown bundling: ✅"
echo "  - SDK and WASM assets: ✅"
echo ""
echo "Output directory: $BUILD_ROOT/"

# Step 8: Assert required CSS assets exist in dist/esm/sdk
if node ./scripts/assert-sdk-css-assets.mjs; then
  print_success "Lit CSS assets assertion passed"
else
  print_error "Lit CSS assets assertion failed"
  exit 1
fi
