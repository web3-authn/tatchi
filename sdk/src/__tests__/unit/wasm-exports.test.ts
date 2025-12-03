/**
 * Unit tests to verify WASM module exports
 *
 * These tests catch issues where bundlers (like Rolldown) expect certain
 * export names based on package names, but the WASM module doesn't provide them.
 *
 * See docs/WASM_BUNDLING.md for details on why these exports are required.
 */

import { test, expect } from '@playwright/test';

test.describe('WASM Module Exports', () => {
  test('wasm_signer_worker exports required functions', async () => {
    // Dynamic import to avoid bundling issues in test environment
    const wasmModule = await import('../../wasm_signer_worker/pkg/wasm_signer_worker.js');

    // Required for embedded bundles (wallet-iframe-host.js, etc.)
    expect(typeof wasmModule.init_wasm_signer_worker).toBe('function');

    // Required for regular builds
    expect(typeof wasmModule.init_worker).toBe('function');

    // Other critical exports
    expect(typeof wasmModule.handle_signer_message).toBe('function');
    expect(typeof wasmModule.WorkerRequestType).toBe('object');
    expect(typeof wasmModule.WorkerResponseType).toBe('object');
  });

  test('wasm_signer_worker has both init aliases', async () => {
    const wasmModule = await import('../../wasm_signer_worker/pkg/wasm_signer_worker.js');

    // Verify both aliases exist and are functions
    expect(wasmModule).toHaveProperty('init_worker');
    expect(wasmModule).toHaveProperty('init_wasm_signer_worker');

    // They should both be functions
    expect(typeof wasmModule.init_worker).toBe('function');
    expect(typeof wasmModule.init_wasm_signer_worker).toBe('function');
  });
});
