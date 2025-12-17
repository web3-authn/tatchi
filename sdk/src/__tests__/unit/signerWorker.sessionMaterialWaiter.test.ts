import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('signer worker – session material waiters', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('fails immediately when VRF sends {ok:false,error} before the sign request', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const { WorkerRequestType, WorkerResponseType } = await import('/sdk/esm/core/types/signer-worker.js');
      const { WorkerControlMessage } = await import('/sdk/esm/core/workerControlMessages.js');

      const workerUrl = new URL('/sdk/workers/web3authn-signer.worker.js', window.location.origin).toString();
      const worker = new Worker(workerUrl, { type: 'module', name: 'SignerWaiterErrorBeforeRequest' });

      const sessionId = `sess-${crypto.randomUUID()}`;
      const channel = new MessageChannel();

      const awaitAttach = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('attach timeout')), 1000);
        worker.addEventListener('message', (ev: MessageEvent) => {
          if (ev?.data?.type === WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK && ev?.data?.sessionId === sessionId) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      worker.postMessage({ type: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT, sessionId }, [channel.port2]);
      await awaitAttach;

      const vrfError = 'Contract verification failed (test)';
      channel.port1.postMessage({ ok: false, error: vrfError });

      const awaitFailure = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('worker response timeout')), 2000);
        worker.addEventListener('message', (ev: MessageEvent) => {
          const msg = ev.data;
          if (!msg || typeof msg.type !== 'number') return;
          if (msg.type === WorkerResponseType.SignTransactionsWithActionsFailure) {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
      });

      worker.postMessage({
        type: WorkerRequestType.SignTransactionsWithActions,
        payload: {
          sessionId,
          rpcCall: { contractId: 'c', nearRpcUrl: 'u', nearAccountId: 'a' },
          createdAt: Date.now(),
          decryption: { encryptedPrivateKeyData: 'AA', encryptedPrivateKeyChacha20NonceB64u: 'AA' },
          txSigningRequests: [{ nearAccountId: 'a', receiverId: 'b', actions: [] }],
          intentDigest: 'intent',
          transactionContext: {
            nearPublicKeyStr: 'pk',
            nextNonce: '1',
            txBlockHeight: '1',
            txBlockHash: 'h',
          },
        },
      });

      const failure = await awaitFailure;
      worker.terminate();
      return { error: failure?.payload?.error || '' };
    });

    expect(res.error).toContain('Contract verification failed');
  });

  test('waits for {ok:true,...} seed material when sign request arrives first', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const { WorkerRequestType, WorkerResponseType } = await import('/sdk/esm/core/types/signer-worker.js');
      const { WorkerControlMessage } = await import('/sdk/esm/core/workerControlMessages.js');

      const workerUrl = new URL('/sdk/workers/web3authn-signer.worker.js', window.location.origin).toString();
      const worker = new Worker(workerUrl, { type: 'module', name: 'SignerWaiterRequestBeforeSeed' });

      const sessionId = `sess-${crypto.randomUUID()}`;
      const channel = new MessageChannel();

      const awaitAttach = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('attach timeout')), 1000);
        worker.addEventListener('message', (ev: MessageEvent) => {
          if (ev?.data?.type === WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK && ev?.data?.sessionId === sessionId) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      worker.postMessage({ type: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT, sessionId }, [channel.port2]);
      await awaitAttach;

      const awaitResult = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('worker response timeout')), 4000);
        worker.addEventListener('message', (ev: MessageEvent) => {
          const msg = ev.data;
          if (!msg || typeof msg.type !== 'number') return;
          if (msg.type === WorkerResponseType.SignTransactionsWithActionsFailure || msg.type === WorkerResponseType.SignTransactionsWithActionsSuccess) {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
      });

      const t0 = performance.now();
      worker.postMessage({
        type: WorkerRequestType.SignTransactionsWithActions,
        payload: {
          sessionId,
          rpcCall: { contractId: 'c', nearRpcUrl: 'u', nearAccountId: 'a' },
          createdAt: Date.now(),
          decryption: { encryptedPrivateKeyData: 'AA', encryptedPrivateKeyChacha20NonceB64u: 'AA' },
          txSigningRequests: [{ nearAccountId: 'a', receiverId: 'b', actions: [] }],
          intentDigest: 'intent',
          transactionContext: {
            nearPublicKeyStr: 'pk',
            nextNonce: '1',
            txBlockHeight: '1',
            txBlockHash: 'h',
          },
        },
      });

      // Ensure the worker doesn't immediately fail with a "missing seed" style error.
      await new Promise(r => setTimeout(r, 50));

      channel.port1.postMessage({
        ok: true,
        wrap_key_seed: 'AA',
        wrapKeySalt: 'BB',
      });

      const msg = await awaitResult;
      const elapsedMs = performance.now() - t0;

      worker.terminate();
      return { elapsedMs, error: msg?.payload?.error || '' };
    });

    expect(res.elapsedMs).toBeGreaterThan(0);
    expect(res.error).not.toContain('Timed out waiting for WrapKeySeed');
  });
});
