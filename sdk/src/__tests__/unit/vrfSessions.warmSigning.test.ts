import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  handle: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/handleSecureConfirmRequest.js',
  types: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/types.js',
} as const;

test.describe('VRF sessions – warm signing', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('SIGN_TRANSACTION warmSession skips TouchID and dispenses session key', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const counts = { dispense: 0, touchId: 0, generateVrf: 0 };
      const reserved: string[] = [];

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark',
          }),
        },
        nonceManager: {
          async getNonceBlockHashAndHeight() {
            return {
              nearPublicKeyStr: 'pk',
              accessKeyInfo: { nonce: 300 },
              nextNonce: '301',
              txBlockHeight: '3000',
              txBlockHash: 'h3000',
            };
          },
          reserveNonces(count: number) {
            const values = Array.from({ length: count }, (_, i) => String(301 + i));
            reserved.push(...values);
            return values;
          },
          releaseNonce(_nonce: string) {},
        },
        nearClient: {},
        vrfWorkerManager: {
          async dispenseSessionKey({ uses }: any) {
            counts.dispense++;
            return { sessionId: 'sess-warm', remainingUses: 10, expiresAtMs: Date.now() + 60_000, uses };
          },
          async generateVrfChallengeForSession() {
            counts.generateVrf++;
            throw new Error('generateVrfChallengeForSession should not be called for warmSession');
          },
          async mintSessionKeysAndSendToSigner() {
            throw new Error('mintSessionKeysAndSendToSigner should not be called for warmSession');
          },
          async checkVrfStatus() {
            return { active: true, nearAccountId: 'alice.testnet' };
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          async getAuthenticationCredentialsInternal() {
            counts.touchId++;
            throw new Error('TouchID prompt should not be called for warmSession');
          },
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

      const request = {
        schemaVersion: 2,
        requestId: 'sess-warm',
        type: types.SecureConfirmationType.SIGN_TRANSACTION,
        summary: {},
        payload: {
          intentDigest: 'intent-warm',
          txSigningRequests: [
            { receiverId: 'x', actions: [] },
            { receiverId: 'y', actions: [] },
          ],
          rpcCall: {
            method: 'sign',
            argsJson: {},
            nearAccountId: 'alice.testnet',
            contractId: 'web3-authn.testnet',
            nearRpcUrl: 'https://rpc.testnet.near.org',
          },
          signingAuthMode: 'warmSession',
        },
      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;

      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);

      const response = workerMessages[0]?.data;
      return { counts, reserved, response };
    }, { paths: IMPORT_PATHS });

    expect(result.counts.dispense).toBe(1);
    expect(result.counts.touchId).toBe(0);
    expect(result.counts.generateVrf).toBe(0);
    expect(result.response.confirmed).toBe(true);
    expect(result.reserved.length).toBeGreaterThan(0);
  });
});
