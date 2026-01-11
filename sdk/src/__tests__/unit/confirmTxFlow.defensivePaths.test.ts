import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  handle: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/handleSecureConfirmRequest.js',
  types: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/types.js',
  events: '/sdk/esm/core/WalletIframe/events.js',
  localOnly: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/flows/localOnly.js',
} as const;

test.describe('confirmTxFlow – defensive paths', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('Signing flow: cancel releases reserved nonces', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const events = await import(paths.events);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const reserved: string[] = [];
      const released: string[] = [];
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
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
          releaseNonce(nonce: string) {
            released.push(nonce);
          },
        },
        nearClient: {},
        vrfWorkerManager: {
          async generateVrfChallengeForSession({ blockHeight, blockHash }: any, _sessionId: string) {
            return { vrfOutput: 'out', vrfProof: 'proof', blockHeight, blockHash };
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsSerialized: async () => ({ id: 'cred', rawId: 'AA', type: 'public-key', response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw' }, clientExtensionResults: { prf: { results: { first: 'BQ' } } } }) as any,
          getAuthenticationCredentialsSerializedDualPrf: async () => ({ id: 'cred', rawId: 'AA', type: 'public-key', response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw' }, clientExtensionResults: { prf: { results: { first: 'BQ', second: 'Bg' } } } }) as any,
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

      const request = {
        requestId: 'cancel-sign',
        type: types.SecureConfirmationType.SIGN_TRANSACTION,
        summary: {},
        payload: {
          intentDigest: 'intent-sign-cancel',
          nearAccountId: 'cancel.testnet',
          txSigningRequests: [{ receiverId: 'x', actions: [] }],
          rpcCall: {
            method: 'sign',
            argsJson: {},
            nearAccountId: 'cancel.testnet',
            contractId: 'web3-authn.testnet',
            nearRpcUrl: 'https://rpc.testnet.near.org',
          },
        },
      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;

      const triggerCancel = () => {
        const attempt = () => {
          const portal = document.getElementById('w3a-confirm-portal');
          const host = portal?.firstElementChild as HTMLElement | null;
          if (host) {
            host.dispatchEvent(new CustomEvent(
              events.WalletIframeDomEvents.TX_CONFIRMER_CANCEL,
              { bubbles: true, composed: true } as any
            ));
          } else {
            setTimeout(attempt, 20);
          }
        };
        setTimeout(attempt, 60);
      };

      triggerCancel();
      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      const response = workerMessages[0]?.data;
      return { reserved, released, response };
    }, { paths: IMPORT_PATHS });

    expect(result.reserved.length).toBeGreaterThan(0);
    expect(result.released).toEqual(result.reserved);
    expect(result.response.confirmed).toBe(false);
  });

  test('Registration flow: cancel releases reserved nonces', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const events = await import(paths.events);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const reserved: string[] = [];
      const released: string[] = [];
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'light'
          }),
        },
        nonceManager: {
          async getNonceBlockHashAndHeight() {
            return {
              nearPublicKeyStr: 'pk-reg',
              accessKeyInfo: { nonce: 10 },
              nextNonce: '11',
              txBlockHeight: '500',
              txBlockHash: 'h500',
            };
          },
          reserveNonces(count: number) {
            const values = Array.from({ length: count }, (_, i) => String(11 + i));
            reserved.push(...values);
            return values;
          },
          releaseNonce(nonce: string) {
            released.push(nonce);
          },
        },
        nearClient: {},
        vrfWorkerManager: {
          async generateVrfKeypairBootstrap({ vrfInputData }: any) {
            return {
              vrfChallenge: {
                vrfOutput: 'bootstrap-out',
                vrfProof: 'bootstrap-proof',
                blockHeight: vrfInputData.blockHeight,
                blockHash: vrfInputData.blockHash,
              },
              vrfPublicKey: 'vrf-pk',
            };
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          generateRegistrationCredentialsInternal: async () => ({}) as any,
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

	      const request = {
	        requestId: 'cancel-reg',
	        type: types.SecureConfirmationType.REGISTER_ACCOUNT,
	        summary: {},
	        payload: {
	          nearAccountId: 'cancel-reg.testnet',
	          deviceNumber: 1,
	          rpcCall: { method: 'register', argsJson: {} },
	        },
	        intentDigest: 'register:cancel-reg.testnet:1',
	      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;

      const triggerCancel = () => {
        const attempt = () => {
          const portal = document.getElementById('w3a-confirm-portal');
          const host = portal?.firstElementChild as HTMLElement | null;
          if (host) {
            host.dispatchEvent(new CustomEvent(
              events.WalletIframeDomEvents.TX_CONFIRMER_CANCEL,
              { bubbles: true, composed: true } as any
            ));
          } else {
            setTimeout(attempt, 20);
          }
        };
        setTimeout(attempt, 60);
      };

      triggerCancel();
      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      const response = workerMessages[0]?.data;
      return { reserved, released, response };
    }, { paths: IMPORT_PATHS });

    expect(result.reserved.length).toBeGreaterThan(0);
    expect(result.released).toEqual(result.reserved);
    expect(result.response.confirmed).toBe(false);
  });

  test('NEP-413 flow: cancel releases reserved nonces', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const events = await import(paths.events);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const reserved: string[] = [];
      const released: string[] = [];
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          }),
        },
        nonceManager: {
          async getNonceBlockHashAndHeight() {
            return {
              nearPublicKeyStr: 'pk-nep',
              accessKeyInfo: { nonce: 50 },
              nextNonce: '51',
              txBlockHeight: '1500',
              txBlockHash: 'h-nep',
            };
          },
          reserveNonces(count: number) {
            const values = Array.from({ length: count }, (_, i) => String(51 + i));
            reserved.push(...values);
            return values;
          },
          releaseNonce(nonce: string) {
            released.push(nonce);
          },
        },
        nearClient: {},
        vrfWorkerManager: {
          async generateVrfChallengeForSession({ blockHeight, blockHash }: any, _sessionId: string) {
            return { vrfOutput: 'nep-out', vrfProof: 'nep-proof', blockHeight, blockHash };
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsSerialized: async () => ({ id: 'cred', rawId: 'AA', type: 'public-key', response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw' }, clientExtensionResults: { prf: { results: { first: 'BQ' } } } }) as any,
          getAuthenticationCredentialsSerializedDualPrf: async () => ({ id: 'cred', rawId: 'AA', type: 'public-key', response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw' }, clientExtensionResults: { prf: { results: { first: 'BQ', second: 'Bg' } } } }) as any,
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

      const request = {
        requestId: 'cancel-nep',
        type: types.SecureConfirmationType.SIGN_NEP413_MESSAGE,
        summary: {},
        payload: {
          nearAccountId: 'cancel-nep.testnet',
          message: 'cancel-me',
          recipient: 'receiver.testnet',
        },
      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;

      const triggerCancel = () => {
        const attempt = () => {
          const portal = document.getElementById('w3a-confirm-portal');
          const host = portal?.firstElementChild as HTMLElement | null;
          if (host) {
            host.dispatchEvent(new CustomEvent(
              events.WalletIframeDomEvents.TX_CONFIRMER_CANCEL,
              { bubbles: true, composed: true } as any
            ));
          } else {
            setTimeout(attempt, 20);
          }
        };
        setTimeout(attempt, 60);
      };

      triggerCancel();
      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      const response = workerMessages[0]?.data;
      return { reserved, released, response };
    }, { paths: IMPORT_PATHS });

    expect(result.reserved.length).toBeGreaterThan(0);
    expect(result.released).toEqual(result.reserved);
    expect(result.response.confirmed).toBe(false);
  });

  test('SHOW_SECURE_PRIVATE_KEY_UI keeps viewer mounted and returns confirmed', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'drawer',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          }),
        },
        nonceManager: {
          getNonceBlockHashAndHeight: async () => ({
            nearPublicKeyStr: '',
            accessKeyInfo: { nonce: 0 },
            nextNonce: '0',
            txBlockHeight: '1',
            txBlockHash: 'h1'
           }),
          reserveNonces: () => [],
          releaseNonce: () => {},
        },
        nearClient: {
          viewBlock: async () => ({ header: { height: 1, hash: 'h1' } }),
        },
        vrfWorkerManager: {
          generateVrfChallenge: async ({ blockHeight, blockHash }: any) => ({
            vrfOutput: 'out',
            vrfProof: 'proof',
            blockHeight,
            blockHash
          }),
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

      const request = {
        requestId: 'show-key',
        type: types.SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI,
        summary: {},
        payload: {
          nearAccountId: 'viewer.testnet',
          publicKey: 'ed25519:dummy',
          privateKey: 'ed25519:secret',
        },
      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;

      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      const response = workerMessages[0]?.data;
      const viewer = document.querySelector('w3a-export-viewer-iframe');
      const stillMounted = !!viewer;
      viewer?.remove();
      return { confirmed: response?.confirmed, stillMounted };
    }, { paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    expect(result.stillMounted).toBe(true);
  });

  test('DECRYPT_PRIVATE_KEY_WITH_PRF uses filtered authenticators for the current device', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.localOnly);
      const types = await import(paths.types);
      const handleLocalOnlyFlow = mod.handleLocalOnlyFlow as Function;

      const authOld = { credentialId: 'cred-old', deviceNumber: 3, transports: [] };
      const authNew = { credentialId: 'cred-new', deviceNumber: 6, transports: [] };
      let capturedAllow: any[] | null = null;

      const ctx: any = {
        indexedDB: {
          clientDB: {
            getAuthenticatorsByUser: async () => [authOld, authNew],
            ensureCurrentPasskey: async () => ({
              authenticatorsForPrompt: [authNew],
              wrongPasskeyError: undefined,
            }),
          }
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsSerialized: async () => ({ id: 'cred-new', rawId: 'cred-new', type: 'public-key', response: { clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw' }, clientExtensionResults: { prf: { results: { first: 'BQ' } } } }) as any,
          getAuthenticationCredentialsSerializedDualPrf: async ({ allowCredentials }: any) => {
            capturedAllow = allowCredentials;
            return {
              id: 'cred-new',
              type: 'public-key',
              rawId: 'cred-new',
              response: {
                clientDataJSON: 'AQ',
                authenticatorData: 'Ag',
                signature: 'Aw',
                userHandle: undefined,
              },
              clientExtensionResults: {
                prf: { results: { first: 'BQ', second: 'Bg' } },
              },
            } as any;
          },
        }
      };

      const request = {
        requestId: 'decrypt-1',
        type: types.SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF,
        summary: {},
        payload: { nearAccountId: 'alice.testnet' },
      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;

      await handleLocalOnlyFlow(ctx, request, worker, {
        confirmationConfig: { uiMode: 'skip', behavior: 'requireClick', autoProceedDelay: 0, theme: 'dark' },
        transactionSummary: {},
      });

      const response = workerMessages[0]?.data;
      return {
        confirmed: response?.confirmed,
        allowIds: (capturedAllow || []).map((c: any) => c.id),
      };
    }, { paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    expect(result.allowIds).toEqual(['cred-new']);
  });

  test('Signing flow: missing PRF output surfaces error', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'dark'
          }),
        },
        nonceManager: {
          async getNonceBlockHashAndHeight() {
            return {
              nearPublicKeyStr: 'pk',
              accessKeyInfo: { nonce: 400 },
              nextNonce: '401',
              txBlockHeight: '4000',
              txBlockHash: 'h4000',
            };
          },
          reserveNonces: () => ['401'],
          releaseNonce: () => {},
        },
        nearClient: {},
        vrfWorkerManager: {
          async generateVrfChallengeForSession({ blockHeight, blockHash }: any, _sessionId: string) {
            return { vrfOutput: 'out', vrfProof: 'proof', blockHeight, blockHash };
          },
          async checkVrfStatus() {
            return { active: true, nearAccountId: 'error.testnet' };
          },
          async mintSessionKeysAndSendToSigner() {
            return;
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsSerialized: async () => {
            throw new Error('Missing PRF result - PRF evaluation failed: results object is empty');
          },
          getAuthenticationCredentialsSerializedDualPrf: async () => {
            throw new Error('Missing PRF result - PRF evaluation failed: results object is empty');
          },
        },
        indexedDB: {
          clientDB: {
            getAuthenticatorsByUser: async () => [],
            ensureCurrentPasskey: async () => ({ authenticatorsForPrompt: [], wrongPasskeyError: undefined }),
            getLastUser: async () => ({ nearAccountId: 'error.testnet', deviceNumber: 1 }),
            getUserByDevice: async () => ({ deviceNumber: 1 }),
          },
          nearKeysDB: {
            getKeyMaterial: async () => ({
              kind: 'local_near_sk_v3',
              nearAccountId: 'error.testnet',
              deviceNumber: 1,
              publicKey: 'ed25519:pk',
              encryptedSk: 'ciphertext-b64u',
              chacha20NonceB64u: 'nonce-b64u',
              wrapKeySalt: 'salt-missing-prf',
              timestamp: Date.now(),
            }),
          },
        },
      };

      const request = {
        requestId: 'prf-fail-sign',
        type: types.SecureConfirmationType.SIGN_TRANSACTION,
        summary: {},
        payload: {
          intentDigest: 'intent-error',
          nearAccountId: 'error.testnet',
          txSigningRequests: [{ receiverId: 'x', actions: [] }],
          rpcCall: {
            method: 'sign',
            argsJson: {},
            nearAccountId: 'error.testnet',
            contractId: 'web3-authn.testnet',
            nearRpcUrl: 'https://rpc.testnet.near.org',
          },
        },
      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;
      let error: string | null = null;
      try {
        await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      } catch (err: any) {
        error = err?.message || String(err);
      }
      return { error, messageCount: workerMessages.length };
    }, { paths: IMPORT_PATHS });

    expect(result.error).toContain('Missing PRF result');
    expect(result.messageCount).toBe(0);
  });

  test('Registration flow: missing PRF output surfaces error', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'light'
          }),
        },
        nonceManager: {
          async getNonceBlockHashAndHeight() {
            return {
              nearPublicKeyStr: 'pk-reg',
              accessKeyInfo: { nonce: 22 },
              nextNonce: '23',
              txBlockHeight: '2200',
              txBlockHash: 'h2200',
            };
          },
          reserveNonces: () => ['23'],
          releaseNonce: () => {},
        },
        nearClient: {},
        vrfWorkerManager: {
          async generateVrfKeypairBootstrap({ vrfInputData }: any) {
            return {
              vrfChallenge: {
                vrfOutput: 'bootstrap',
                vrfProof: 'bootstrap-proof',
                blockHeight: vrfInputData.blockHeight,
                blockHash: vrfInputData.blockHash,
              },
              vrfPublicKey: 'vrf-pk',
            };
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          generateRegistrationCredentialsInternal: async () => ({
            id: 'reg-cred',
            type: 'public-key',
            rawId: new Uint8Array([1]).buffer,
            response: {
              clientDataJSON: new Uint8Array([1]).buffer,
              attestationObject: new Uint8Array([2]).buffer,
              getTransports: () => ['internal'],
            },
            getClientExtensionResults: () => ({ prf: { results: {} } }),
          }) as any,
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

	      const request = {
	        requestId: 'prf-fail-reg',
	        type: types.SecureConfirmationType.REGISTER_ACCOUNT,
	        summary: {},
	        payload: {
	          nearAccountId: 'error-reg.testnet',
	          deviceNumber: 1,
	          rpcCall: { method: 'register', argsJson: {} },
	        },
	        intentDigest: 'register:error-reg.testnet:1',
	      } as any;

      const workerMessages: any[] = [];
      const worker = { postMessage: (msg: any) => workerMessages.push(msg) } as unknown as Worker;
      let error: string | null = null;
      try {
        await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      } catch (err: any) {
        error = err?.message || String(err);
      }
      return { error, messageCount: workerMessages.length };
    }, { paths: IMPORT_PATHS });

    expect(result.error).toContain('Missing PRF result');
    expect(result.messageCount).toBe(0);
  });
});
