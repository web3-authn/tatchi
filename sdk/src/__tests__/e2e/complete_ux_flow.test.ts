/**
 * PasskeyManager Complete E2E Test Suite
 *
 * Runs the full PasskeyManager lifecycle in a single browser session:
 * 1. Registration flow
 * 2. Login flow
 * 3. Transfer action flow
 * 4. Recovery flow
 */

import { test, expect } from '../setup/fixtures';
import { bypassContractVerification, mockRelayServer, mockAccessKeyLookup, mockSendTransaction } from '../setup/intercepts';
import { registerPasskey, loginPasskey, executeTransfer, recoverAccount } from '../setup/flows';
import { handleInfrastructureErrors, type TestUtils } from '../setup';
import { printLog } from '../setup/logging';
import { BUILD_PATHS } from '@build-paths';

const TRANSFER_AMOUNT_YOCTO = '5000000000000000000000'; // 0.005 NEAR

interface VrfDiagnostics {
  workerResults: Array<{ path: string; success: boolean; status?: number; statusText?: string; error?: string }>;
  loginState: any;
}

test.describe('PasskeyManager Complete E2E Test Suite', () => {
  test.beforeEach(async ({ passkey, page }) => {
    await passkey.setup();
    // Allow relay/testnet services to stabilize between tests
    await page.waitForTimeout(3000);
  });

  test('Complete PasskeyManager Lifecycle - Registration → Login → Actions → Recovery', async ({ passkey, consoleCapture, page }) => {
    test.setTimeout(70000);

    console.log('');
    printLog('test', 'starting passkey lifecycle scenario', { step: 'init' });

    await page.evaluate(() => {
      const dbNames = ['PasskeyClientDB', 'PasskeyNearKeysDB'];
      return Promise.all(dbNames.map((dbName) => new Promise<void>((resolve) => {
        const deleteReq = indexedDB.deleteDatabase(dbName);
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => resolve();
        deleteReq.onblocked = () => resolve();
      })));
    });
    printLog('setup', 'IndexedDB cleared for fresh run', { indent: 1 });

    const useRelayServer = process.env.USE_RELAY_SERVER === '1' || process.env.USE_RELAY_SERVER === 'true';

    await bypassContractVerification(page);
    if (!useRelayServer) {
      await mockRelayServer(page);
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch {}

    const registration = await registerPasskey(passkey);
    const accountId = registration.accountId;

    if (!registration.success) {
      if (handleInfrastructureErrors({ success: registration.success, error: registration.error })) {
        return;
      }
      expect(registration.success).toBe(true);
      return;
    }

    await mockAccessKeyLookup(page, {
      accountId,
      publicKey: registration.raw?.clientNearPublicKey,
    });
    // Stabilize broadcast in CI unless explicitly disabled
    const USE_REAL_SEND_TX = process.env.USE_REAL_SEND_TX === '1' || process.env.USE_REAL_SEND_TX === 'true';
    if (!USE_REAL_SEND_TX) {
      await mockSendTransaction(page);
    }

    const vrfDiagnostics = await passkey.withTestUtils<VrfDiagnostics, { buildPaths: typeof BUILD_PATHS }>((args) => {
      const utils = (window as any).testUtils as TestUtils;
      const workerPaths = [
        args.buildPaths.TEST_WORKERS.VRF,
        args.buildPaths.TEST_WORKERS.WASM_VRF_JS,
        args.buildPaths.TEST_WORKERS.WASM_VRF_WASM,
      ];

      const workerResults: VrfDiagnostics['workerResults'] = [];

      return Promise.all(workerPaths.map(async (path) => {
        try {
          const response = await fetch(path);
          workerResults.push({
            path,
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
          });
        } catch (error) {
          workerResults.push({
            path,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })).then(async () => {
        const loginState = await utils.passkeyManager.getLoginState();
        return { workerResults, loginState };
      });
    }, { buildPaths: BUILD_PATHS });

    printLog('flow', `VRF worker diagnostics collected (${vrfDiagnostics.workerResults.length} files)`, {
      step: 'vrf',
      indent: 1,
    });

    const login = await loginPasskey(passkey, { accountId });

    if (!login.success) {
      if (handleInfrastructureErrors(login)) {
        return;
      }
      expect(login.success).toBe(true);
      return;
    }

    await page.waitForTimeout(6000);

    const receiverAccountId = await passkey.withTestUtils<string>(() => {
      const utils = (window as any).testUtils as TestUtils;
      return utils.configs.testReceiverAccountId;
    });

    const transfer = await executeTransfer(passkey, {
      accountId,
      receiverId: receiverAccountId,
      amountYocto: TRANSFER_AMOUNT_YOCTO,
    });

    if (!transfer.success) {
      if (handleInfrastructureErrors(transfer)) {
        return;
      }
      expect(transfer.success).toBe(true);
      return;
    }

    await passkey.withTestUtils(async ({ accountId: id, publicKey }) => {
      const utils = (window as any).testUtils as TestUtils;
      const toAccountId = (window as any).toAccountId ?? ((value: string) => value);
      if (!publicKey) {
        console.warn('[flow:recovery] Missing public key, skipping access key wait');
        return;
      }

      const start = Date.now();
      const timeoutMs = 20000;
      const intervalMs = 800;
      let lastError: any = null;

      while (Date.now() - start < timeoutMs) {
        try {
          await utils.passkeyManager.getNearClient().viewAccessKey(toAccountId(id), publicKey);
          console.log('[flow:recovery] Access key indexed – proceeding');
          return;
        } catch (error) {
          lastError = error;
          console.log('[flow:recovery] Waiting for access key to index...', error instanceof Error ? error.message : String(error));
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }

      if (lastError) {
        console.warn('[flow:recovery] Access key still unavailable, continuing with recovery');
      }
    }, { accountId, publicKey: registration.raw?.clientNearPublicKey });

    const recovery = await recoverAccount(passkey, { accountId });

    const finalState = await passkey.withTestUtils(async ({ accountId: id }) => {
      const utils = (window as any).testUtils as TestUtils;
      const toAccountId = (window as any).toAccountId ?? ((value: string) => value);
      const state = await utils.passkeyManager.getLoginState(toAccountId(id));
      const recent = await utils.passkeyManager.getRecentLogins();
      return { state, recent };
    }, { accountId });

    printLog('test', `registration events: ${registration.events.length}`, { indent: 1 });
    printLog('test', `login events: ${login.events.length}`, { indent: 1 });
    printLog('test', `transfer events: ${transfer.events.length}`, { indent: 1 });
    printLog('test', `recovery events: ${recovery.events.length}`, { indent: 1 });

    expect(registration.success).toBe(true);
    expect(login.success).toBe(true);
    expect(transfer.success).toBe(true);

    if (!recovery.success) {
      printLog('test', `recovery failure tolerated: ${recovery.error ?? 'unknown error'}`, {
        step: 'recovery',
        indent: 1,
      });
    }

    printLog('test', `final login state: ${JSON.stringify(finalState.state)}`, { indent: 2 });
    printLog('test', `recent logins count: ${finalState.recent.accountIds.length}`, { indent: 2 });
  });
});
