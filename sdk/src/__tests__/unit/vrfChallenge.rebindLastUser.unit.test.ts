import { expect, test } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  gen: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/handlers/generateVrfChallenge.js',
} as const;

test.describe('VRF challenge generation – lastUser binding', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('rebinds VRF worker keypair to IndexedDB lastUser before generating a challenge', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.gen);
      const generateVrfChallengeForSession = mod.generateVrfChallengeForSession as Function;

      const expectedVrfPublicKey = 'vpk-right';
      let activeVrfPublicKey = 'vpk-wrong';

      const messageTypes: string[] = [];
      const ctx: any = {
        ensureWorkerReady: async () => {},
        generateMessageId: () => `m_${Math.random().toString(16).slice(2)}`,
        getCurrentVrfAccountId: () => 'alice.testnet',
        setCurrentVrfAccountId: (_next: string | null) => {},
        postToWorker: () => {},
        getContext: () => ({
          indexedDB: {
            clientDB: {
              getLastUser: async () => ({
                nearAccountId: 'alice.testnet',
                deviceNumber: 2,
                passkeyCredential: { id: 'id', rawId: 'CQ' },
                encryptedVrfKeypair: { encryptedVrfDataB64u: 'enc', chacha20NonceB64u: 'nonce' },
                serverEncryptedVrfKeypair: {
                  ciphertextVrfB64u: 'ciphertext',
                  kek_s_b64u: 'kek',
                  serverKeyId: 'server-key-1',
                },
              }),
              getAuthenticatorsByUser: async () => ([
                { credentialId: 'Cg', deviceNumber: 1, vrfPublicKey: 'vpk-wrong' },
                { credentialId: 'CQ', deviceNumber: 2, vrfPublicKey: expectedVrfPublicKey },
              ]),
            },
          },
        }),
        sendMessage: async (message: any) => {
          const type = String(message?.type || '');
          messageTypes.push(type);

          if (type === 'CHECK_VRF_STATUS') {
            return {
              success: true,
              data: { active: true, sessionDuration: 1, vrfPublicKey: activeVrfPublicKey },
            };
          }

          if (type === 'SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR') {
            activeVrfPublicKey = expectedVrfPublicKey;
            return { success: true, data: null };
          }

          if (type === 'GENERATE_VRF_CHALLENGE') {
            const payload = message?.payload?.vrfInputData || {};
            return {
              success: true,
              data: {
                vrfInput: 'in',
                vrfOutput: 'out',
                vrfProof: 'proof',
                vrfPublicKey: activeVrfPublicKey,
                userId: payload.userId,
                rpId: payload.rpId,
                blockHeight: payload.blockHeight,
                blockHash: payload.blockHash,
                intentDigest: payload.intentDigest,
              },
            };
          }

          return { success: false, error: `unexpected message type: ${type}` };
        },
      };

      const challenge = await generateVrfChallengeForSession(
        ctx,
        { userId: 'alice.testnet', rpId: 'example.localhost', blockHeight: '1', blockHash: 'h1', intentDigest: 'intent' },
        'session-1',
      );

      return { messageTypes, vrfPublicKey: challenge?.vrfPublicKey };
    }, { paths: IMPORT_PATHS });

    expect(result.vrfPublicKey).toBe('vpk-right');
    expect(result.messageTypes).toEqual([
      'CHECK_VRF_STATUS',
      'SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR',
      'CHECK_VRF_STATUS',
      'GENERATE_VRF_CHALLENGE',
    ]);
  });
});

