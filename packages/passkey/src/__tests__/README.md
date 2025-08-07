# PasskeyManager E2E Test Suite

Playwright end-to-end testing for the PasskeyManager SDK with WebAuthn virtual authenticator support.

## Table of Contents

- [Test Architecture](#test-architecture)
- [Build & Asset Management](#build--asset-management)
- [Test Environment Setup](#test-environment-setup)
- [Running Tests](#running-tests)
- [Test Files Overview](#test-files-overview)
- [Troubleshooting](#troubleshooting)

## Test Architecture

The test suite uses Playwright with a Chromium browser to test real WebAuthn functionality using virtual authenticators. Tests run against a local development server and import the built SDK from copied assets.

### Key Components

- **Virtual WebAuthn Authenticator**: Simulates hardware security keys
- **Import Map**: Provides NEAR.js dependencies in browser context
- **Built SDK Assets**: Tests run against production-like built files
- **Dynamic Module Loading**: SDK modules loaded at runtime in browser

## Build & Asset Management

### Automatic Build Process

When you run `npm test`, the following happens in order:

1. **Build Freshness Check**: `npm run build:check:fresh`
   - Compares timestamps of source files vs built files
   - Checks entire directories: `src/core/`, `src/wasm_signer_worker/`, `src/wasm_vrf_worker/`
   - If build is fresh, skips to step 4

2. **Conditional Rebuild**: If build is stale:
   ```bash
   npm run build
   ```

3. **Asset Copying**: Copy built files to frontend directory:
   ```bash
   # Copy complete SDK (including workers) to frontend
   mkdir -p ../../frontend/public/sdk
   cp -r dist/* ../../frontend/public/sdk/
   ```

4. **Run Tests**: `playwright test`

### Asset Locations

**All SDK Files** (`dist/` → `frontend/public/sdk/`):
- `esm/` - ES modules (main SDK)
- `cjs/` - CommonJS modules
- `types/` - TypeScript definitions
- `workers/` - Worker files directory
  - `web3authn-signer.worker.js` - Transaction signing worker
  - `web3authn-vrf.worker.js` - VRF operations worker
  - `wasm_signer_worker.js` - WASM signer bindings
  - `wasm_signer_worker_bg.wasm` - WASM signer binary
  - `wasm_vrf_worker.js` - WASM VRF bindings
  - `wasm_vrf_worker_bg.wasm` - WASM VRF binary

> **Note**: All files are copied to a single location (`frontend/public/sdk/`) for simple organization. Worker files are in the `workers/` subdirectory for better separation.

> **Important**: If the frontend moves from `frontend/public/` to another directory, update the copy commands in the `test` script and `copy-wasm-assets.sh`.

## Test Environment Setup

### 5-Step Sequential Setup Process

Every test runs through `setupBasicPasskeyTest()` which performs:

#### Step 1: WebAuthn Virtual Authenticator
```typescript
// Set up virtual authenticator for WebAuthn testing
const authenticatorId = await page.evaluate(() => {
  return navigator.credentials.create({
    publicKey: {
      // Virtual authenticator configuration
    }
  });
});
```

#### Step 2: Import Map Injection
```typescript
// Inject import map for NEAR.js dependencies
await page.addInitScript(() => {
  const importMap = {
    "imports": {
      "near-api-js": "https://cdn.jsdelivr.net/npm/near-api-js@latest/dist/near-api-js.min.js",
      // ... other dependencies
    }
  };
  document.head.appendChild(importMapScript);
});
```

#### Step 3: Environment Stabilization
```typescript
// Wait for environment to be ready
await page.waitForFunction(() => {
  return window.navigator && window.crypto && window.indexedDB;
});
```

#### Step 4: PasskeyManager Loading
```typescript
// Dynamically load PasskeyManager from copied SDK
const { PasskeyManager } = await import('/sdk/esm/index.js');
const passkeyManager = new PasskeyManager(config);
```

#### Step 5: Global Fallbacks
```typescript
// Ensure required globals are available
window.testUtils = {
  passkeyManager,
  generateTestAccountId,
  // ... other utilities
};
```

### Virtual Authenticator Configuration

The virtual authenticator is configured with:
- **Protocol**: CTAP2
- **Transport**: USB
- **Resident Key**: Supported
- **User Verification**: Supported
- **PRF Extension**: Enabled (for dual PRF functionality)

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
# Run VRF worker tests
npm test -- src/__tests__/e2e/vrfWorkerManager_dual_prf.test.ts

# Run complete UX flow test
npm test -- src/__tests__/e2e/complete_ux_flow.test.ts

# Run registration rollback tests
npm test -- src/__tests__/e2e/registration-rollback.test.ts
```

### Run Specific Test Case
```bash
# Run specific test by name
npm test -- --grep "VRF Worker Manager - Initialization"

# Run tests matching pattern
npm test -- --grep "Error Handling"
```

### Development Mode
```bash
# Run tests in headed mode (see browser)
npm test -- --headed

# Run tests with debug output
npm test -- --reporter=line

# Run tests with video recording
npm test -- --video=on
```

### Manual Build & Copy (without tests)
```bash
# Just build and copy assets
npm run build:check:fresh || (npm run build && mkdir -p ../../frontend/public/sdk && cp -r dist/* ../../frontend/public/sdk/)
```

## Test Files Overview

### Core Test Files

#### `complete_ux_flow.test.ts`
- **Purpose**: End-to-end user journey testing
- **Flow**: Registration → Login → Actions → Recovery
- **Features**: Complete PasskeyManager lifecycle
- **Duration**: ~30-45 seconds

#### `vrfWorkerManager_dual_prf.test.ts`
- **Purpose**: VRF worker functionality testing
- **Tests**: Keypair generation, deterministic derivation, session management
- **Features**: Dual PRF support, error handling, WASM worker communication
- **Duration**: ~15-20 seconds

#### `registration-rollback.test.ts`
- **Purpose**: Registration rollback and cleanup testing
- **Tests**: Presigned delete transactions, account cleanup
- **Features**: NEAR testnet account management
- **Duration**: ~10-15 seconds

#### Test Reports
HTML reports generated at: `test-results/`
```bash
# View report
npx playwright show-report
```