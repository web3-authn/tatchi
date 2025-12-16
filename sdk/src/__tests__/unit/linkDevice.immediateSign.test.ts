import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

const IMPORT_PATHS = {
  linkDevice: '/sdk/esm/core/TatchiPasskey/linkDevice.js',
  indexedDb: '/sdk/esm/core/IndexedDBManager/index.js',
  getDeviceNumber: '/sdk/esm/core/WebAuthnManager/SignerWorkerManager/getDeviceNumber.js',
  signTxs: '/sdk/esm/core/WebAuthnManager/SignerWorkerManager/handlers/signTransactionsWithActions.js',
  signerTypes: '/sdk/esm/core/types/signer-worker.js',
  actions: '/sdk/esm/core/types/actions.js',
} as const;

test.describe('Link device → immediate sign (regression)', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('linkDevice storage leaves account immediately signable', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const pm: any = (window as any).passkeyManager;
        if (!pm?.webAuthnManager) {
          throw new Error('passkeyManager.webAuthnManager missing in test harness');
        }

        const { LinkDeviceFlow } = await import(paths.linkDevice);
        const { IndexedDBManager } = await import(paths.indexedDb);
        const { getLastLoggedInDeviceNumber } = await import(paths.getDeviceNumber);
        const { signTransactionsWithActions } = await import(paths.signTxs);
        const { WorkerResponseType } = await import(paths.signerTypes);
        const { ActionType } = await import(paths.actions);

        const nearAccountId = 'linkdev1.w3a-v1.testnet';
        const deviceNumber = 2;

        // Patch COSE extraction to avoid needing a real attestation object for this regression.
        const webAuthnManager: any = pm.webAuthnManager;
        const originalExtract = webAuthnManager.extractCosePublicKey?.bind(webAuthnManager);
        if (typeof webAuthnManager.extractCosePublicKey === 'function') {
          webAuthnManager.extractCosePublicKey = async () => new Uint8Array([1, 2, 3]);
        }

        const dummyCredential = {
          id: 'cred-id',
          rawId: 'cred-rawid-b64u',
          type: 'public-key',
          authenticatorAttachment: 'platform',
          response: {
            clientDataJSON: 'clientDataJSON-b64u',
            attestationObject: 'attestationObject-b64u',
            transports: ['internal'],
          },
          clientExtensionResults: { prf: { results: { first: undefined, second: undefined } } },
        };

        const flow = new LinkDeviceFlow(pm.getContext(), {});
        // LinkDeviceFlow.storeDeviceAuthenticator is private in TS but callable at runtime.
        (flow as any).session = {
          accountId: nearAccountId,
          deviceNumber,
          nearPublicKey: 'ed25519:temp',
          credential: dummyCredential,
          vrfChallenge: null,
          phase: 'idle',
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        };

        const deterministicKeysResult = {
          encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf', chacha20NonceB64u: 'nonce' },
          serverEncryptedVrfKeypair: null,
          vrfPublicKey: 'vrfpk',
          nearPublicKey: 'ed25519:pk-device2',
          credential: dummyCredential,
          vrfChallenge: undefined,
        };

        await (flow as any).storeDeviceAuthenticator(deterministicKeysResult);

        // LinkDeviceFlow derives/stores the encrypted NEAR key earlier in the real flow.
        // For this regression, store a minimal entry so signing can proceed immediately.
        await IndexedDBManager.nearKeysDB.storeEncryptedKey({
          nearAccountId: nearAccountId,
          deviceNumber,
          encryptedData: 'ciphertext-b64u',
          chacha20NonceB64u: 'nonce-b64u',
          wrapKeySalt: 'wrapKeySalt-b64u',
          version: 2,
          timestamp: Date.now(),
        });

        const last = await IndexedDBManager.clientDB.getLastUser();
        const deviceFromHelper = await getLastLoggedInDeviceNumber(nearAccountId, IndexedDBManager.clientDB);
        const key = await IndexedDBManager.nearKeysDB.getEncryptedKey(nearAccountId, deviceFromHelper);
        const authenticators = await IndexedDBManager.clientDB.getAuthenticatorsByUser(nearAccountId);

        // Exercise the signing handler path up to and including the IndexedDB lookups.
        // We stub the VRF confirmation and worker response so the test stays deterministic
        // and focuses on "link device → immediate sign" state wiring.
        const signingCtx: any = {
          indexedDB: IndexedDBManager,
          vrfWorkerManager: {
            confirmAndPrepareSigningSession: async () => ({
              intentDigest: 'intent',
              transactionContext: {
                nearPublicKeyStr: 'ed25519:pk-device2',
                nextNonce: '1',
                txBlockHeight: '1',
                txBlockHash: 'blockhash',
                accessKeyInfo: { nonce: 0 },
              },
              credential: dummyCredential,
            }),
          },
          sendMessage: async () => ({
            type: WorkerResponseType.SignTransactionsWithActionsSuccess,
            payload: {
              success: true,
              signedTransactions: [
                { transaction: {}, signature: {}, borshBytes: new Uint8Array([1]) },
              ],
              logs: [],
            },
          }),
        };

        const signed = await signTransactionsWithActions({
          ctx: signingCtx,
          transactions: [
            {
              receiverId: nearAccountId,
              actions: [{ action_type: ActionType.Transfer, deposit: '1' }],
            },
          ],
          rpcCall: { nearAccountId },
          sessionId: 'linkdevice-regression',
        });

        // Restore patched method to avoid leaking state within the page.
        if (originalExtract) webAuthnManager.extractCosePublicKey = originalExtract;

        return {
          success: true,
          lastUser: last ? { nearAccountId: last.nearAccountId, deviceNumber: last.deviceNumber } : null,
          deviceFromHelper,
          hasEncryptedKey: !!key?.encryptedData,
          authenticatorCount: Array.isArray(authenticators) ? authenticators.length : 0,
          signedCount: Array.isArray(signed) ? signed.length : 0,
        } as const;
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) } as const;
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.lastUser?.nearAccountId).toBe('linkdev1.w3a-v1.testnet');
    expect(result.lastUser?.deviceNumber).toBe(2);
    expect(result.deviceFromHelper).toBe(2);
    expect(result.hasEncryptedKey).toBe(true);
    expect(result.authenticatorCount).toBeGreaterThan(0);
    expect(result.signedCount).toBe(1);
  });
});

