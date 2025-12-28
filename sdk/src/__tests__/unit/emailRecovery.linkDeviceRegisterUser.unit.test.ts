import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  emailRecoveryIndex: '/sdk/esm/core/EmailRecovery/index.js',
  emailRecoveryFlow: '/sdk/esm/core/TatchiPasskey/emailRecovery.js',
  emailRecoveryTypes: '/sdk/esm/core/types/emailRecovery.js',
} as const;

const CONFIG = {
  relayer: {
    emailRecovery: {
      minBalanceYocto: '0',
      pollingIntervalMs: 10,
      maxPollingDurationMs: 1000,
      pendingTtlMs: 60_000,
      mailtoAddress: 'recovery@example.com',
      dkimVerifierAccountId: 'dkim.testnet',
      verificationViewMethod: 'get_verification_result',
    },
  },
  contractId: 'contract.testnet',
  nearRpcUrl: 'https://rpc.testnet',
  vrfWorkerConfigs: {
    shamir3pass: { relayServerUrl: 'https://relay.testnet' },
  },
} as const;

test.describe('EmailRecovery: link_device_register_user SuccessValue parsing', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('parseLinkDeviceRegisterUserResponse returns verified response', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.emailRecoveryIndex);
      const parse = mod.parseLinkDeviceRegisterUserResponse;
      if (typeof parse !== 'function') throw new Error('parseLinkDeviceRegisterUserResponse export missing');

      const payload = { verified: false, registration_info: null };
      const outcome = { status: { SuccessValue: btoa(JSON.stringify(payload)) } };
      return parse(outcome);
    }, { paths: IMPORT_PATHS });

    expect(result?.verified).toBe(false);
  });

  test('parseLinkDeviceRegisterUserResponse returns null on non-JSON', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.emailRecoveryIndex);
      const parse = mod.parseLinkDeviceRegisterUserResponse;
      const outcome = { status: { SuccessValue: btoa('not-json') } };
      return parse(outcome);
    }, { paths: IMPORT_PATHS });

    expect(result).toBeNull();
  });
});

test.describe('EmailRecovery: verified:false yields typed error codes', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('broadcastRegistrationTxAndWaitFinal throws EmailRecoveryErrorCode.VRF_CHALLENGE_EXPIRED on stale challenge logs', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const flowMod = await import(paths.emailRecoveryFlow);
      const typesMod = await import(paths.emailRecoveryTypes);
      const EmailRecoveryFlow = flowMod.EmailRecoveryFlow ?? flowMod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) throw new Error('EmailRecoveryFlow export missing');

      const payload = { verified: false, registration_info: null };
      const outcome = {
        status: { SuccessValue: btoa(JSON.stringify(payload)) },
        transaction: { hash: 'tx123' },
        transaction_outcome: { outcome: { logs: ['VRF input validation failed: StaleChallenge'] } },
        receipts_outcome: [],
      };

      const nearClient = {
        sendTransaction: async () => outcome,
      };

      const flow = new EmailRecoveryFlow({ configs: config, nearClient, webAuthnManager: {} });
      const rec = { accountId: 'alice.testnet', nearPublicKey: 'ed25519:alice' };

      try {
        await (flow as any).broadcastRegistrationTxAndWaitFinal(rec, {});
        return { ok: true };
      } catch (err: any) {
        return {
          ok: false,
          name: err?.name,
          code: err?.code,
          expected: typesMod.EmailRecoveryErrorCode.VRF_CHALLENGE_EXPIRED,
        };
      }
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.ok).toBe(false);
    expect(result.name).toBe('EmailRecoveryError');
    expect(result.code).toBe(result.expected);
  });

  test('finalizeRegistration preserves EmailRecoveryError code via onError', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const flowMod = await import(paths.emailRecoveryFlow);
      const typesMod = await import(paths.emailRecoveryTypes);
      const EmailRecoveryFlow = flowMod.EmailRecoveryFlow ?? flowMod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) throw new Error('EmailRecoveryFlow export missing');

      const payload = { verified: false, registration_info: null };
      const outcome = {
        status: { SuccessValue: btoa(JSON.stringify(payload)) },
        transaction: { hash: 'tx456' },
        transaction_outcome: { outcome: { logs: ['registration verification failed'] } },
        receipts_outcome: [],
      };

      const nearClient = {
        sendTransaction: async () => outcome,
      };

      const webAuthnManager = {
        getNonceManager: () => ({ initializeUser: () => {} }),
        signDevice2RegistrationWithStoredKey: async () => ({ success: true, signedTransaction: {} }),
      };

      const pendingStore = {
        get: async () => null,
        set: async () => {},
        clear: async () => {},
        touchIndex: async () => {},
      };

      const onError: any[] = [];
      const flow = new EmailRecoveryFlow(
        { configs: config, nearClient, webAuthnManager },
        { pendingStore, onError: (e: any) => onError.push({ name: e?.name, code: e?.code }) }
      );

      const rec = {
        accountId: 'bob.testnet',
        recoveryEmail: 'bob@example.com',
        deviceNumber: 2,
        nearPublicKey: 'ed25519:bob',
        requestId: 'REQ1',
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'enc', chacha20NonceB64u: 'nonce' },
        serverEncryptedVrfKeypair: null,
        vrfPublicKey: 'vrf',
        credential: {
          id: 'cred-id',
          rawId: 'cred-raw',
          type: 'public-key',
          response: { attestationObject: 'att', clientDataJSON: 'client' },
        },
        vrfChallenge: { vrfPublicKey: 'vrf', blockHash: 'block', intent: 'x' },
        createdAt: 1000,
        status: 'finalizing',
      };

      try {
        await (flow as any).finalizeRegistration(rec);
        return { ok: true };
      } catch (err: any) {
        return {
          ok: false,
          thrown: { name: err?.name, code: err?.code },
          onError: onError[0],
          expected: typesMod.EmailRecoveryErrorCode.REGISTRATION_NOT_VERIFIED,
        };
      }
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected finalizeRegistration to fail');
    const thrown = (result as any).thrown as { name?: string; code?: string };
    expect(thrown?.name).toBe('EmailRecoveryError');
    expect(thrown?.code).toBe((result as any).expected);
    expect((result as any).onError?.code).toBe((result as any).expected);
  });
});
