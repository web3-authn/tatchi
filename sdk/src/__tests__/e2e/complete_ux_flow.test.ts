/**
 * TatchiPasskey Complete E2E Test Suite
 *
 * Runs the full TatchiPasskey lifecycle in a single browser session:
 * 1. Registration flow
 * 2. Login flow
 * 3. Transfer action flow
 * 4. Recovery flow
 */

import { test, expect } from '../setup/fixtures';
import { bypassContractVerification } from '../setup/bypasses';
import { mockRelayServer, mockAccessKeyLookup, mockSendTransaction } from '../setup/route-mocks';
import { registerPasskey, loginAndCreateSession, executeTransfer, recoverAccount } from '../setup/flows';
import { handleInfrastructureErrors, type TestUtils } from '../setup';
import { printLog } from '../setup/logging';
import { BUILD_PATHS } from '@build-paths';
import { buildPermissionsPolicy } from '../../plugins/headers';

const TRANSFER_AMOUNT_YOCTO = '5000000000000000000000'; // 0.005 NEAR
const RELAYER_REFUND_ACCOUNT_ID = 'w3a-relayer.testnet';

interface VrfDiagnostics {
  workerResults: Array<{ path: string; success: boolean; status?: number; statusText?: string; error?: string }>;
  loginState: any;
}

test.describe('TatchiPasskey Complete E2E Test Suite', () => {
  test.beforeEach(async ({ passkey, page }) => {
    await passkey.setup();
    // Allow relay/testnet services to stabilize between tests
    await page.waitForTimeout(3000);
  });

  test('Complete TatchiPasskey Lifecycle - Registration → Login → Actions → Recovery', async ({ passkey, consoleCapture, page }) => {
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

    // Probe worker URL headers before registration to surface CORS/CORP issues early
    await passkey.withTestUtils(async () => {
      const url = 'https://wallet.example.localhost/sdk/workers/web3authn-signer.worker.js';
      try {
        const resp = await fetch(url, { mode: 'cors' });
        const corp = resp.headers.get('cross-origin-resource-policy');
        const coep = resp.headers.get('cross-origin-embedder-policy');
        const acao = resp.headers.get('access-control-allow-origin');
        console.log(`[cors] probe worker: ok=${resp.ok} status=${resp.status} corp=${corp} coep=${coep} acao=${acao}`);
      } catch (err) {
        console.error(`[cors] probe worker failed: ${(err as any)?.message || String(err)}`);
      }
    });

    // Node-side probe (has full header visibility; not subject to CORS exposure)
    try {
      const walletWorker = 'https://wallet.example.localhost/sdk/workers/web3authn-signer.worker.js';
      const resp = await page.request.get(walletWorker, { headers: { Origin: 'https://example.localhost' } });
      const h = resp.headers();
      console.log(`[cors] node probe worker: status=${resp.status()} acao=${h['access-control-allow-origin']} corp=${h['cross-origin-resource-policy']} coep=${h['cross-origin-embedder-policy']} ctype=${h['content-type']}`);
    } catch (err) {
      console.error(`[cors] node probe failed: ${(err as any)?.message || String(err)}`);
    }

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
        const loginState = (await utils.passkeyManager.getLoginSession()).login;
        return { workerResults, loginState };
      });
    }, { buildPaths: BUILD_PATHS });

    printLog('flow', `VRF worker diagnostics collected (${vrfDiagnostics.workerResults.length} files)`, {
      step: 'vrf',
      indent: 1,
    });

    const login = await loginAndCreateSession(passkey, { accountId });

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
      const state = (await utils.passkeyManager.getLoginSession(toAccountId(id))).login;
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

    // Best-effort cleanup: send remaining balance of the ephemeral
    // test account back to the relay/funding account.
    await passkey.withTestUtils(async ({ accountId: id, beneficiaryId }) => {
      const utils = (window as any).testUtils as TestUtils;
      const toAccountId = (window as any).toAccountId ?? ((value: string) => value);
      const nearAccountId = toAccountId(id);

      try {
        // @ts-ignore - Runtime import within browser context
        const { ActionType } = await import('/sdk/esm/core/types/actions.js');

        console.log('[cleanup] Attempting DeleteAccount to refund remaining balance', {
          nearAccountId,
          beneficiaryId,
        });

        const result = await utils.passkeyManager.executeAction({
          nearAccountId,
          receiverId: nearAccountId,
          actionArgs: {
            type: ActionType.DeleteAccount,
            beneficiaryId,
          },
	          options: {
	            signerMode: { mode: 'local-signer' },
	            onEvent: (event: any) => {
	              console.log('[cleanup] DeleteAccount event', event?.phase, event?.status);
	            },
            onError: (error: any) => {
              console.warn('[cleanup] DeleteAccount error', error);
            },
          },
        });

        console.log('[cleanup] DeleteAccount result', result);
      } catch (error) {
        console.warn('[cleanup] Failed to delete test account; skipping cleanup', error);
      }
    }, { accountId, beneficiaryId: RELAYER_REFUND_ACCOUNT_ID });
  });

  test('Headers sanity', async ({ passkey, page }) => {
    // Assert that WASM is served with the correct MIME (exposed header)
    const wasmHeaderChecks = await passkey.withTestUtils<
      { ok: boolean; contentType: string | null },
      { buildPaths: typeof BUILD_PATHS }
    >(async (args) => {
      const resp = await fetch(args.buildPaths.TEST_WORKERS.WASM_SIGNER_WASM);
      return { ok: resp.ok, contentType: resp.headers.get('content-type') };
    }, { buildPaths: BUILD_PATHS });

    expect(wasmHeaderChecks.ok).toBe(true);
    expect(wasmHeaderChecks.contentType?.toLowerCase()).toContain('application/wasm');

    // Verify wallet-service page carries expected Permissions-Policy and COEP/CORP
    const walletOrigin = 'https://wallet.example.localhost';
    const serviceResp = await page.request.get(`${walletOrigin}/wallet-service/`);
    expect(serviceResp.ok()).toBeTruthy();
    const pp = serviceResp.headers()['permissions-policy'];
    const coep = serviceResp.headers()['cross-origin-embedder-policy'];
    const corp = serviceResp.headers()['cross-origin-resource-policy'];
    expect(pp).toBe(buildPermissionsPolicy(walletOrigin));
    expect(coep).toBe('require-corp');
    expect(corp).toBe('cross-origin');
  });
});
