# PasskeyManager E2E Test Suite

Playwright end-to-end testing for the PasskeyManager SDK with WebAuthn virtual authenticator support.

## Table of Contents

- [Test Architecture](#test-architecture)
- [Build & Asset Management](#build--asset-management)
- [Test Environment Setup](#test-environment-setup)
- [Running Tests](#running-tests)
- [Test Files Overview](#test-files-overview)
- [Troubleshooting](#troubleshooting)
  - [Wallet iframe READY timeout under COEP](#wallet-iframe-ready-timeout-under-coep)

## Test Architecture

The test suite uses Playwright with a Chromium browser to test real WebAuthn functionality using virtual authenticators. Tests run against a local development server and import the built SDK served at `/sdk/*` by the Vite dev plugin (no file copying).

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

3. **Run Tests**: `playwright test` (the Vite plugin serves `/sdk/*` directly from `dist/`)

### Asset Locations

SDK assets live under `dist/` and are served at `/sdk/*` by the dev plugin:
- `dist/esm/**` - ES modules (main SDK and embedded bundles)
- `dist/cjs/**` - CommonJS modules
- `dist/types/**` - TypeScript definitions
- `dist/workers/**` - Worker bundles and WASM binaries

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
// Dynamically load PasskeyManager from served SDK assets
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

### Manual Build (without tests)
```bash
# Just build the SDK (dev server will serve from dist/)
npm run build
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

## Troubleshooting

### Wallet iframe READY timeout under COEP

Chromium enforces [Cross-Origin-Embedder-Policy](https://web.dev/coop-coep/) during our tests because the example app serves `COEP: require-corp`. If the wallet iframe handshake is posted with `targetOrigin='*'`, the browser silently discards the transferable `MessagePort`, so the client never observes `READY` and the tests fail with `Wallet iframe READY timeout`.

To keep the iframe tests stable:

- Always post the initial `CONNECT` message to the exact wallet origin (for example `https://wallet.example.localhost`). The real wallet host validates envelopes, so this stays safe while satisfying Chromium’s transferable rules under COEP.
- Ensure the Playwright wallet stub mirrors the production host: send permissive `Cross-Origin-*` headers, adopt incoming ports, reply to `PM_CANCEL` with an `ERROR` (code `CANCELLED`), and emit progress phases such as `ActionPhase.STEP_2_USER_CONFIRMATION`. Without those stubs the overlay visibility assertions will never see the iframe expand.

If you update the handshake logic, re-run:

```bash
pnpm exec playwright test src/__tests__/wallet-iframe/playwright/handshake.test.ts --project=chromium
pnpm exec playwright test src/__tests__/e2e/cancel_overlay_contracts.test.ts --project=chromium
```

These cover both the transport handshake and the overlay cancel contract that depends on the simulated progress events.
