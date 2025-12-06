import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

const IMPORT_PATHS = {
  handle: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/handleSecureConfirmRequest.js',
} as const;

test.describe('handlePromptUserConfirmInJsMainThread - Orchestrator Unit Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(300);
  });

  test('Unsupported type falls back to structured error', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        // Dynamically import orchestrator from built ESM bundle
        const mod = await import(paths.handle);
        const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

        // Minimal SignerWorkerManagerContext stub (determineConfirmationConfig uses user preferences)
        const ctx: any = {
          userPreferencesManager: {
            getConfirmationConfig: () => ({
              uiMode: 'modal',
              behavior: 'requireClick',
              autoProceedDelay: 0,
              theme: 'dark'
            })
          }
        };

        // Capture worker responses
        const responses: any[] = [];
        const worker: any = { postMessage: (msg: any) => responses.push(msg) };

        // Request with unsupported type but with non-empty payload to bypass payload guard
        const request = {
          schemaVersion: 2,
          requestId: 'req-1',
          type: 'unsupported_type',
          summary: {},
          payload: { any: 'value' },
        } as any;

        await handle(ctx, {
          type: 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD',
          data: request
        }, worker);

        return { success: true, responses };
      } catch (error: any) {
        return { success: false, error: error?.message, stack: error?.stack };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.responses?.length).toBe(1);
    const evt = result.responses?.[0];
    expect(evt?.type).toBe('USER_PASSKEY_CONFIRM_RESPONSE');
    expect(evt?.data?.confirmed).toBe(false);
    expect(String(evt?.data?.error || '')).toContain('Unsupported');
  });

  test('Missing payload returns validation error', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const mod = await import(paths.handle);
        const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

        const ctx: any = {
          userPreferencesManager: {
            getConfirmationConfig: () => ({
              uiMode: 'modal',
              behavior: 'requireClick',
              autoProceedDelay: 0,
              theme: 'dark'
            })
          }
        };

        const responses: any[] = [];
        const worker: any = { postMessage: (msg: any) => responses.push(msg) };

        const request = {
          schemaVersion: 2,
          requestId: 'req-2',
          type: 'signTransaction', // valid type but payload missing
          summary: {},
          // payload omitted
        } as any;

        await handle(ctx, {
          type: 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD',
          data: request
        }, worker);

        return { success: true, responses };
      } catch (error: any) {
        return { success: false, error: error?.message, stack: error?.stack };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.responses?.length).toBe(1);
    const evt = result.responses?.[0];
    expect(evt?.type).toBe('USER_PASSKEY_CONFIRM_RESPONSE');
    expect(evt?.data?.confirmed).toBe(false);
    expect(String(evt?.data?.error || '')).toContain('Invalid secure confirm request');
  });

  test('Signing request with PRF or wrap key fields is rejected defensively', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const mod = await import(paths.handle);
        const handle = mod.handlePromptUserConfirmInJsMainThread as Function;
        const types = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/types.js');

        const ctx: any = {
          userPreferencesManager: {
            getConfirmationConfig: () => ({
              uiMode: 'modal',
              behavior: 'requireClick',
              autoProceedDelay: 0,
              theme: 'dark'
            })
          }
        };

        const responses: any[] = [];
        const worker: any = { postMessage: (msg: any) => responses.push(msg) };

        // Include fields that should never appear in a main-thread signing envelope.
        const request = {
          schemaVersion: 2,
          requestId: 'req-prf-wrap',
          type: types.SecureConfirmationType.SIGN_TRANSACTION,
          summary: {},
          payload: {
            intentDigest: 'intent-prf-wrap',
            nearAccountId: 'alice.testnet',
            txSigningRequests: [{ receiverId: 'x', actions: [] }],
            rpcCall: {
              method: 'sign',
              argsJson: {},
              nearAccountId: 'alice.testnet',
              contractId: 'web3-authn.testnet',
              nearRpcUrl: 'https://rpc.testnet.near.org',
            },
            prfOutput: 'leaked-prf',
            wrapKeySeed: 'leaked-wrapKeySeed',
          },
        } as any;

        await handle(ctx, {
          type: 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD',
          data: request
        }, worker);

        return { success: true, responses };
      } catch (error: any) {
        return { success: false, error: error?.message, stack: error?.stack };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.responses?.length).toBe(1);
    const evt = result.responses?.[0];
    expect(evt?.type).toBe('USER_PASSKEY_CONFIRM_RESPONSE');
    expect(evt?.data?.confirmed).toBe(false);
    // Current implementation treats this as a generic invalid request; ensure it is rejected.
    expect(String(evt?.data?.error || '')).toContain('Invalid secure confirm request');
  });
});
