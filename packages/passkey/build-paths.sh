#!/bin/bash

# Centralized build configuration (bash version)
# This file defines all paths used across the build system

# Build output directories
BUILD_ROOT="dist"
BUILD_WORKERS="dist/workers"
BUILD_ESM="dist/esm"
BUILD_CJS="dist/cjs"
BUILD_TYPES="dist/types"

# Source directories
SOURCE_ROOT="src"
SOURCE_CORE="src/core"
SOURCE_WASM_SIGNER="src/wasm_signer_worker"
SOURCE_WASM_VRF="src/wasm_vrf_worker"

# Critical directories for build freshness checking
CRITICAL_DIRS=(
    "src/core"
    "src/wasm_signer_worker"
    "src/wasm_vrf_worker"
)

# Frontend deployment paths
FRONTEND_ROOT="../../frontend/public"
FRONTEND_SDK="../../frontend/public/sdk"
FRONTEND_WORKERS="../../frontend/public/sdk/workers"

# Runtime paths (used by workers and tests)
RUNTIME_SDK_BASE="/sdk"
RUNTIME_WORKERS_BASE="/sdk/workers"
RUNTIME_VRF_WORKER="/sdk/workers/web3authn-vrf.worker.js"
RUNTIME_SIGNER_WORKER="/sdk/workers/web3authn-signer.worker.js"

# Worker file names
WORKER_VRF="web3authn-vrf.worker.js"
WORKER_SIGNER="web3authn-signer.worker.js"
WORKER_WASM_VRF_JS="wasm_vrf_worker.js"
WORKER_WASM_VRF_WASM="wasm_vrf_worker_bg.wasm"
WORKER_WASM_SIGNER_JS="wasm_signer_worker.js"
WORKER_WASM_SIGNER_WASM="wasm_signer_worker_bg.wasm"

# Critical files to check for build freshness
CRITICAL_FILES=(
    "src/core/WebAuthnManager/vrfWorkerManager.ts"
    "src/core/WebAuthnManager/signerWorkerManager.ts"
    "src/core/WebAuthnManager/index.ts"
    "src/core/PasskeyManager/index.ts"
    "src/core/PasskeyManager/actions.ts"
    "src/core/PasskeyManager/login.ts"
    "src/core/PasskeyManager/registration.ts"
    "src/index.ts"
    "rolldown.config.ts"
    "tsconfig.json"
)

# Helper functions
get_worker_path() {
    echo "${BUILD_WORKERS}/$1"
}

get_runtime_worker_path() {
    echo "${RUNTIME_WORKERS_BASE}/$1"
}

get_frontend_worker_path() {
    echo "${FRONTEND_WORKERS}/$1"
}