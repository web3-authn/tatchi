#!/bin/bash

# Script to generate TypeScript types from Rust using wasm-bindgen and validate consistency

set -e

# Source build paths
source ./build-paths.sh

echo "Generating TypeScript types from Rust using wasm-bindgen..."

# Function to handle errors with more detail
handle_error() {
    local exit_code=$?
    local line_number=$1
    echo ""
    echo "❌ Type generation failed at line $line_number with exit code $exit_code"
    echo ""
    echo "Last few lines of output:"
    tail -10 /tmp/type_gen.log 2>/dev/null || echo "No log file available"
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Check if Rust compilation succeeds: cd src/wasm_signer_worker && cargo check"
    echo "  2. Verify wasm-pack is installed: wasm-pack --version"
    echo "  3. Check for WASM compilation errors in the output above"
    echo "  4. Ensure all Rust dependencies are properly declared"
    exit $exit_code
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Create log file for capturing detailed output
LOG_FILE="/tmp/type_gen.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

# 1. Build WASM signer worker and generate TypeScript definitions
echo "Building WASM signer worker..."
cd "$SOURCE_WASM_SIGNER"

echo "Running cargo check first..."
cargo check

echo "Running wasm-pack build..."
wasm-pack build --target web --out-dir ../wasm_signer_worker --out-name wasm_signer_worker

cd ../..

# 2. Build WASM VRF worker and generate TypeScript definitions
echo "Building WASM VRF worker..."
cd "$SOURCE_WASM_VRF"

echo "Running cargo check first..."
cargo check

echo "Running wasm-pack build..."
wasm-pack build --target web --out-dir ../wasm_vrf_worker --out-name wasm_vrf_worker

cd ../..

# 3. Check if wasm-bindgen generated types exist
SIGNER_TYPES="$SOURCE_WASM_SIGNER/wasm_signer_worker.d.ts"
VRF_TYPES="$SOURCE_WASM_VRF/wasm_vrf_worker.d.ts"

if [ ! -f "$SIGNER_TYPES" ]; then
    echo "❌ Signer worker TypeScript definitions not found at $SIGNER_TYPES"
    echo "This usually means wasm-pack build failed for the signer worker."
    echo "Check the output above for compilation errors."
    exit 1
fi

if [ ! -f "$VRF_TYPES" ]; then
    echo "❌ VRF worker TypeScript definitions not found at $VRF_TYPES"
    echo "This usually means wasm-pack build failed for the VRF worker."
    echo "Check the output above for compilation errors."
    exit 1
fi

echo "✅ TypeScript definitions generated successfully by wasm-bindgen"

# 4. Run type checking to ensure consistency
echo "Running TypeScript type checking..."
if ! npx tsc --noEmit; then
    echo ""
    echo "❌ TypeScript type checking failed"
    echo "This usually means there are type inconsistencies between generated WASM types and TypeScript code."
    echo "Check the TypeScript errors above for details."
    exit 1
fi

echo "✅ Type generation and validation complete!"
echo ""
echo "Generated files:"
echo "  - $SIGNER_TYPES (Signer worker types from wasm-bindgen)"
echo "  - $VRF_TYPES (VRF worker types from wasm-bindgen)"
echo "  - Validated against existing TypeScript codebase"
echo ""

# Clean up log file
rm -f "$LOG_FILE"
