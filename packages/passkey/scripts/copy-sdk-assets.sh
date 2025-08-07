#!/bin/bash

# Copy worker assets to frontend directory
# This script copies all necessary worker files from the passkey package to the frontend public directory

set -e  # Exit on any error

# Source centralized build configuration
source "$(dirname "$0")/../build-paths.sh"

echo "Copying SDK files to frontend..."

# Ensure the target directory exists
mkdir -p "$FRONTEND_SDK"

# Copy the entire workers directory
echo "Copying workers directory..."
cp -r "$BUILD_WORKERS" "$FRONTEND_SDK/"

# Copy WASM binary files from source directories
echo "Copying WASM binary files..."
cp "$SOURCE_WASM_SIGNER/$WORKER_WASM_SIGNER_WASM" "$FRONTEND_WORKERS/" 2>/dev/null || echo "Warning: WASM signer binary not found"
cp "$SOURCE_WASM_VRF/$WORKER_WASM_VRF_WASM" "$FRONTEND_WORKERS/" 2>/dev/null || echo "Warning: WASM VRF binary not found"

# Copy additional WASM JavaScript files
cp "$SOURCE_WASM_SIGNER/$WORKER_WASM_SIGNER_JS" "$FRONTEND_WORKERS/" 2>/dev/null || echo "Warning: WASM signer JS not found"
cp "$SOURCE_WASM_VRF/$WORKER_WASM_VRF_JS" "$FRONTEND_WORKERS/" 2>/dev/null || echo "Warning: WASM VRF JS not found"

# Copy the ESM directory for test modules
echo "Copying ESM modules..."
cp -r "$BUILD_ESM" "$FRONTEND_SDK/"

# Copy the CJS directory for compatibility
echo "Copying CJS modules..."
cp -r "$BUILD_CJS" "$FRONTEND_SDK/"

echo "✅ SDK files copied successfully!"
echo "Files copied to: $FRONTEND_SDK"
echo ""
echo "SDK structure available:"
ls -la "$FRONTEND_SDK"