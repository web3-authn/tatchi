// Centralized build configuration
// This file defines all paths used across the build system

export const BUILD_PATHS = {
  // Build output directories
  BUILD: {
    ROOT: 'dist',
    WORKERS: 'dist/workers',
    ESM: 'dist/esm',
    CJS: 'dist/cjs',
    TYPES: 'dist/types'
  },

  // Source directories
  SOURCE: {
    ROOT: 'src',
    CORE: 'src/core',
    WASM_SIGNER: 'src/wasm_signer_worker',
    WASM_VRF: 'src/wasm_vrf_worker',
    CRITICAL_DIRS: [
      'src/core',
      'src/wasm_signer_worker',
      'src/wasm_vrf_worker'
    ]
  },

  // Frontend deployment paths
  FRONTEND: {
    ROOT: '../../frontend/public',
    SDK: '../../frontend/public/sdk',
    WORKERS: '../../frontend/public/sdk/workers'
  },

  // Runtime paths (used by workers and tests)
  RUNTIME: {
    SDK_BASE: '/sdk',
    WORKERS_BASE: '/sdk/workers',
    VRF_WORKER: '/sdk/workers/web3authn-vrf.worker.js',
    SIGNER_WORKER: '/sdk/workers/web3authn-signer.worker.js'
  },

  // Worker file names
  WORKERS: {
    VRF: 'web3authn-vrf.worker.js',
    SIGNER: 'web3authn-signer.worker.js',
    WASM_VRF_JS: 'wasm_vrf_worker.js',
    WASM_VRF_WASM: 'wasm_vrf_worker_bg.wasm',
    WASM_SIGNER_JS: 'wasm_signer_worker.js',
    WASM_SIGNER_WASM: 'wasm_signer_worker_bg.wasm'
  },

  // Test worker file paths (for test files)
  TEST_WORKERS: {
    VRF: '/sdk/workers/web3authn-vrf.worker.js',
    SIGNER: '/sdk/workers/web3authn-signer.worker.js',
    WASM_VRF_JS: '/sdk/workers/wasm_vrf_worker.js',
    WASM_VRF_WASM: '/sdk/workers/wasm_vrf_worker_bg.wasm',
    WASM_SIGNER_JS: '/sdk/workers/wasm_signer_worker.js',
    WASM_SIGNER_WASM: '/sdk/workers/wasm_signer_worker_bg.wasm'
  }
} as const;

// Helper functions
export const getWorkerPath = (workerName: string): string => `${BUILD_PATHS.BUILD.WORKERS}/${workerName}`;
export const getRuntimeWorkerPath = (workerName: string): string => `${BUILD_PATHS.RUNTIME.WORKERS_BASE}/${workerName}`;
export const getFrontendWorkerPath = (workerName: string): string => `${BUILD_PATHS.FRONTEND.WORKERS}/${workerName}`;

// Default export for easier importing
export default BUILD_PATHS;