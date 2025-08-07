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
if wasm-pack build --target web --out-dir .; then
    print_success "WASM signer worker built successfully"
else
    print_error "WASM signer worker build failed"
    exit 1
fi
cd ../..

# Step 4: Build WASM VRF worker
print_step "Building WASM VRF worker..."
cd "$SOURCE_WASM_VRF"
if wasm-pack build --target web --out-dir .; then
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
if ~/.bun/bin/bun build "$SOURCE_CORE/web3authn-signer.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser && \
    ~/.bun/bin/bun build "$SOURCE_CORE/web3authn-vrf.worker.ts" --outdir "$BUILD_WORKERS" --format esm --target browser; then
    print_success "Bun worker bundling completed"
else
    print_error "Bun worker bundling failed"
    exit 1
fi

# Step 7: Copy SDK assets
print_step "Copying SDK assets..."
if ./scripts/copy-sdk-assets.sh; then
    print_success "SDK assets copied successfully"
else
    print_warning "SDK asset copying completed with warnings"
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