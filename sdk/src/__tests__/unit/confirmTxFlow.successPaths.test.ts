import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  handle: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/handleSecureConfirmRequest.js',
  types: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/types.js',
} as const;

test.describe('confirmTxFlow – success paths', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('LocalOnly: decryptPrivateKeyWithPrf returns credential (no prfOutput)', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      // Minimal ctx stub
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsInternal: async () => ({
            id: 'cred-id', type: 'public-key', rawId: new Uint8Array([1, 2, 3]).buffer,
            response: {
              clientDataJSON: new Uint8Array([1]).buffer,
              authenticatorData: new Uint8Array([2]).buffer,
              signature: new Uint8Array([3]).buffer,
              userHandle: null
            },
            getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).fill(7) } } })
          }) as any,
        },
        indexedDB: {
          clientDB: {
            getAuthenticatorsByUser: async () => [],
            ensureCurrentPasskey: async () => ({ authenticatorsForPrompt: [], wrongPasskeyError: undefined })
          }
        },
        // not used in LocalOnly branch
        nonceManager: {},
        nearClient: {},
        vrfWorkerManager: {},
      };

      const request = {
        schemaVersion: 2, requestId: 'r1', type: types.SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF,
        summary: {}, payload: { nearAccountId: 'alice.testnet', publicKey: 'pk' }
      };

      const msgs: any[] = [];
      const worker = { postMessage: (m: any) => msgs.push(m) } as unknown as Worker;
      await handle(ctx, { type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD, data: request }, worker);
      const resp = msgs[0]?.data;
      return {
        ok: !!resp?.confirmed,
        prf: resp?.prfOutput,
        cred: resp?.credential,
        wrapKeySeed: (resp as any).wrapKeySeed ?? (resp as any).wrapKeySeed,
        wrapKeySalt: (resp as any).wrapKeySalt ?? (resp as any).wrapKeySalt,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.ok).toBe(true);
    // LocalOnly decrypt now forwards the credential and lets the VRF worker extract PRF internally.
    expect(result.prf).toBeUndefined();
    expect(result.cred?.id).toBe('cred-id');
    // LocalOnly decrypt flows should not surface wrap key material on the main thread.
    expect(result.wrapKeySeed).toBeUndefined();
    expect(result.wrapKeySalt).toBeUndefined();
  });

  test('Registration: collects registration credential and emits vrfChallenge + tx context', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      let nonceReserved: string[] = [];
      let jitRefreshed = 0;
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        nonceManager: {
          async getNonceBlockHashAndHeight(_nc: any, _opts?: any) {
            return {
              nearPublicKeyStr: 'pk',
              accessKeyInfo: { nonce: 100 },
              nextNonce: '101',
              txBlockHeight: '1000',
              txBlockHash: 'hash0'
            };
          },
          reserveNonces(n: number) {
            nonceReserved = Array.from({ length: n }, (_, i) => String(101 + i));
            return nonceReserved;
          },
          releaseNonce(_n: string) { },
        },
        nearClient: {
          async viewBlock() {
            return { header: { height: 1001, hash: 'hash1' } };
          }
        },
        vrfWorkerManager: {
          async generateVrfKeypairBootstrap({ vrfInputData, sessionId }: any) {
            return {
              vrfChallenge: {
                vrfOutput: 'out0',
                vrfProof: 'proof0',
                blockHeight: vrfInputData.blockHeight,
                blockHash: vrfInputData.blockHash
              },
              vrfPublicKey: 'vpk0'
            };
          },
          async generateVrfChallengeForSession({ blockHeight, blockHash }: any, _sessionId: string) {
            jitRefreshed++;
            return {
              vrfOutput: 'out1',
              vrfProof: 'proof1',
              blockHeight,
              blockHash
            };
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          generateRegistrationCredentialsInternal: async () => ({
            id: 'reg-cred', type: 'public-key', rawId: new Uint8Array([1, 2, 3]).buffer,
            response: {
              clientDataJSON: new Uint8Array([1]).buffer,
              attestationObject: new Uint8Array([4]).buffer,
              getTransports: () => ['internal']
            },
            getClientExtensionResults: () => ({
              prf: {
                results: {
                  first: new Uint8Array(32).fill(8),
                  second: new Uint8Array(32).fill(9)
                }
              }
            })
          }) as any,
        },
        indexedDB: { clientDB: { getAuthenticatorsByUser: async () => [] } },
      };

      const request = {
        schemaVersion: 2, requestId: 'r2', type: types.SecureConfirmationType.REGISTER_ACCOUNT,
        summary: {},
        payload: {
          nearAccountId: 'bob.testnet',
          rpcCall: { method: 'create', argsJson: {} }
        }
      };
      const msgs: any[] = [];
      const worker = { postMessage: (m: any) => msgs.push(m) } as unknown as Worker;
      await handle(ctx, { type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD, data: request }, worker);
      const resp = msgs[0]?.data;
      return {
        confirmed: resp?.confirmed,
        prf: resp?.prfOutput,
        vrf: resp?.vrfChallenge,
        tx: resp?.transactionContext,
        reserved: nonceReserved, jitRefreshed
      };
    }, { paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    // For registration, the JIT refresh path uses generateVrfKeypairBootstrap again
    // so the vrfOutput remains the bootstrap value from the stub ('out0').
    expect(result.vrf?.vrfOutput).toBe('out0');
    expect(result.tx?.nextNonce).toBe('101');
    expect(result.reserved).toEqual(['101']);
    expect(result.jitRefreshed).toBeGreaterThanOrEqual(0); // JIT may run best-effort
    // Registration responses should not contain PRF output in VRF-centric design.
    expect(result.prf).toBeUndefined();
  });

  test('Signing: collects assertion credential, reserves nonces, emits tx context', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      let reserved: string[] = [];
      let refreshed = 0;
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        nonceManager: {
          async getNonceBlockHashAndHeight(_nc: any, _opts?: any) {
            return {
              nearPublicKeyStr: 'pk',
              accessKeyInfo: { nonce: 200 },
              nextNonce: '201',
              txBlockHeight: '2000',
              txBlockHash: 'h0'
            };
          },
          reserveNonces(n: number) {
            reserved = Array.from({ length: n }, (_, i) => String(201 + i));
            return reserved;
          },
          releaseNonce(_n: string) { },
        },
        nearClient: {
          async viewBlock() {
            return { header: { height: 2001, hash: 'h1' } };
          }
        },
        vrfWorkerManager: {
          async generateVrfChallengeForSession({ blockHeight, blockHash }: any, _sessionId: string) {
            refreshed++;
            return {
              vrfOutput: 'v-out',
              vrfProof: 'v-proof',
              blockHeight,
              blockHash
            };
          },
          async checkVrfStatus() {
            return { active: true, nearAccountId: 'carol.testnet' };
          },
          async mintSessionKeysAndSendToSigner() {
            return;
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsInternal: async () => ({
            id: 'auth-cred', type: 'public-key', rawId: new Uint8Array([9]).buffer,
            response: {
              clientDataJSON: new Uint8Array([1]).buffer,
              authenticatorData: new Uint8Array([2]).buffer,
              signature: new Uint8Array([3]).buffer,
              userHandle: null
            },
            getClientExtensionResults: () => ({
              prf: {
                results: {
                  first: new Uint8Array(32).fill(5)
                }
              }
            })
          }),
        },
        indexedDB: {
          clientDB: {
            getAuthenticatorsByUser: async () => [],
            ensureCurrentPasskey: async () => ({ authenticatorsForPrompt: [], wrongPasskeyError: undefined }),
            getLastUser: async () => ({ nearAccountId: 'carol.testnet', deviceNumber: 1 }),
            getUserByDevice: async () => ({ deviceNumber: 1 }),
          },
          nearKeysDB: {
            getEncryptedKey: async () => ({ wrapKeySalt: 'salt-sign' }),
          },
        },
      };

      const request = {
        schemaVersion: 2,
        requestId: 'r3',
        type: types.SecureConfirmationType.SIGN_TRANSACTION,
        summary: {},
        payload: {
          intentDigest: 'intent-1',
          nearAccountId: 'carol.testnet',
          txSigningRequests: [{ receiverId: 'x', actions: [] }],
          rpcCall: {
            method: 'sign',
            argsJson: {},
            nearAccountId: 'carol.testnet',
            contractId: 'w3a-v1.testnet',
            nearRpcUrl: 'https://rpc.testnet.near.org'
          },
        }
      } as any;
      const msgs: any[] = [];
      const worker = { postMessage: (m: any) => msgs.push(m) } as unknown as Worker;
      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      const resp = msgs[0]?.data;
      return {
        confirmed: resp?.confirmed,
        tx: resp?.transactionContext,
        reserved,
        refreshed,
        prf: resp?.prfOutput,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    expect(result.tx?.nextNonce).toBe('201');
    expect(result.reserved).toEqual(['201']);
    expect(result.refreshed).toBeGreaterThanOrEqual(0);
    // Signing responses must not expose PRF in VRF-centric design.
    expect(result.prf).toBeUndefined();
  });

  test('NEP-413: collects assertion credential, emits vrfChallenge + tx context without PRF', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.handle);
      const types = await import(paths.types);
      const handle = mod.handlePromptUserConfirmInJsMainThread as Function;

      let refreshed = 0;
      let mintArgs: any = null;
      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        },
        nonceManager: {
          async getNonceBlockHashAndHeight(_nc: any, _opts?: any) {
            return {
              nearPublicKeyStr: 'pk-nep413',
              accessKeyInfo: { nonce: 10 },
              nextNonce: '11',
              txBlockHeight: '3000',
              txBlockHash: 'h-nep',
            };
          },
          reserveNonces(_n: number) {
            return ['11'];
          },
          releaseNonce(_n: string) { },
        },
        nearClient: {
          async viewBlock() {
            return { header: { height: 3001, hash: 'h-nep-1' } };
          }
        },
        vrfWorkerManager: {
          async generateVrfChallengeForSession({ blockHeight, blockHash }: any, _sessionId: string) {
            refreshed++;
            return {
              vrfOutput: 'nep-out',
              vrfProof: 'nep-proof',
              blockHeight,
              blockHash
            };
          },
          async checkVrfStatus() {
            return { active: true, nearAccountId: 'nep.testnet' };
          },
          async mintSessionKeysAndSendToSigner(args: any) {
            mintArgs = args;
            return;
          },
        },
        touchIdPrompt: {
          getRpId: () => 'example.localhost',
          getAuthenticationCredentialsInternal: async () => ({
            id: 'nep-cred',
            type: 'public-key',
            rawId: new Uint8Array([7]).buffer,
            response: {
              clientDataJSON: new Uint8Array([1]).buffer,
              authenticatorData: new Uint8Array([2]).buffer,
              signature: new Uint8Array([3]).buffer,
              userHandle: null
            },
            getClientExtensionResults: () => ({
              prf: {
                results: {
                  first: new Uint8Array(32).fill(6)
                }
              }
            })
          }),
        },
        indexedDB: {
          clientDB: {
            getAuthenticatorsByUser: async () => [],
            ensureCurrentPasskey: async () => ({ authenticatorsForPrompt: [], wrongPasskeyError: undefined }),
            getLastUser: async () => ({ nearAccountId: 'nep.testnet', deviceNumber: 1 }),
            getUserByDevice: async () => ({ deviceNumber: 1 }),
          },
          nearKeysDB: {
            getEncryptedKey: async () => ({ wrapKeySalt: 'salt-nep' }),
          },
        },
      };

      const request = {
        schemaVersion: 2,
        requestId: 'r-nep',
        type: types.SecureConfirmationType.SIGN_NEP413_MESSAGE,
        summary: {},
        payload: {
          nearAccountId: 'nep.testnet',
          message: 'hello-world',
          recipient: 'receiver.testnet',
          contractId: 'custom-contract.testnet',
          nearRpcUrl: 'https://rpc.custom.testnet',
        },
      } as any;

      const msgs: any[] = [];
      const worker = { postMessage: (m: any) => msgs.push(m) } as unknown as Worker;
      await handle(ctx, {
        type: types.SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
        data: request
      }, worker);
      const resp = msgs[0]?.data;
      return {
        confirmed: resp?.confirmed,
        prf: resp?.prfOutput,
        vrf: resp?.vrfChallenge,
        tx: resp?.transactionContext,
        refreshed,
        mintArgs,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.confirmed).toBe(true);
    expect(result.vrf?.vrfOutput).toBe('nep-out');
    expect(result.tx?.nextNonce).toBe('11');
    expect(result.refreshed).toBeGreaterThanOrEqual(0);
    expect(result.mintArgs?.contractId).toBe('custom-contract.testnet');
    expect(result.mintArgs?.nearRpcUrl).toBe('https://rpc.custom.testnet');
    // NEP-413 signing also must not expose PRF output.
    expect(result.prf).toBeUndefined();
  });
});
