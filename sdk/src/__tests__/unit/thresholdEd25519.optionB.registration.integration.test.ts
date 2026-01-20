import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519.js';
import { createHash } from 'node:crypto';

const IMPORT_PATHS = {
  nearKeysDb: '/sdk/esm/core/IndexedDBManager/passkeyNearKeysDB.js',
  tatchi: '/sdk/esm/core/TatchiPasskey/index.js',
} as const;

function toB64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function compute2of2GroupPk(input: {
  clientVerifyingShareB64u: string;
  relayerVerifyingShareB64u: string;
}): string {
  const clientBytes = new Uint8Array(Buffer.from(input.clientVerifyingShareB64u, 'base64url'));
  const relayerBytes = new Uint8Array(Buffer.from(input.relayerVerifyingShareB64u, 'base64url'));
  const clientPoint = ed25519.Point.fromBytes(clientBytes);
  const relayerPoint = ed25519.Point.fromBytes(relayerBytes);
  const groupPoint = clientPoint.multiply(2n).subtract(relayerPoint);
  return `ed25519:${bs58.encode(groupPoint.toBytes())}`;
}

test.describe('Threshold Ed25519 Option B (post-registration AddKey)', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    // We run the core registration flow in same-origin mode for deterministic tests
    // (avoid depending on the wallet iframe host being available).
    const blankPageUrl = new URL('/__test_blank.html', DEFAULT_TEST_CONFIG.frontendUrl).toString();
    await setupBasicPasskeyTest(page, {
      frontendUrl: blankPageUrl,
      skipPasskeyManagerInit: true,
    });

    // setupBasicPasskeyTest() skips bootstrap "global fallbacks" when tatchi init is skipped.
    // WebAuthn mocks expect base64UrlEncode/base64UrlDecode to be present on window.
    await page.evaluate(async () => {
      const { base64UrlEncode, base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
      (window as any).base64UrlEncode = base64UrlEncode;
      (window as any).base64UrlDecode = base64UrlDecode;
    });
  });

  test('registration with signerMode=threshold-signer activates threshold key (AddKey) and stores threshold material', async ({ page }) => {
    const consoleMessages: string[] = [];
    const onConsole = (msg: any) => {
      try { consoleMessages.push(`[${msg.type?.() || 'log'}] ${msg.text?.() || String(msg)}`); } catch {}
    };
    const onPageError = (err: any) => {
      try { consoleMessages.push(`[pageerror] ${String(err?.message || err)}`); } catch {}
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    let sendTxCount = 0;
    let localNearPublicKey = '';
    let thresholdPublicKey = '';
    let relayIntentDigest32: number[] | null = null;
    const relayerKeyId = 'relayer-keyid-mock-1';
    const relayerVerifyingShareB64u = toB64u(ed25519.Point.BASE.toBytes());
    let thresholdActivatedOnChain = false;
    const accountsOnChain = new Set<string>();

    await page.route('**://test.rpc.fastnear.com/**', async (route) => {
      const req = route.request();
      const method = req.method().toUpperCase();

      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        return;
      }

      if (method !== 'POST') {
        return route.fallback();
      }

      let body: any = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch {
        body = {};
      }

      const rpcMethod = body?.method;
      const params = body?.params || {};
      const id = body?.id ?? '1';

      const blockHash = bs58.encode(Buffer.alloc(32, 7));
      const blockHeight = 123;

      if (rpcMethod === 'block') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { header: { hash: blockHash, height: blockHeight } },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'call_function') {
        const methodName = params?.method_name;
        const resultBytes = Array.from(Buffer.from(JSON.stringify({ verified: true }), 'utf8'));
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { result: resultBytes, logs: [`mock call_function ${String(methodName || '')}`] },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_account') {
        const accountId = String(params?.account_id || '');
        if (!accountsOnChain.has(accountId)) {
          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: 'UNKNOWN_ACCOUNT',
                data: 'UNKNOWN_ACCOUNT',
              },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              amount: '0',
              locked: '0',
              code_hash: '11111111111111111111111111111111',
              storage_usage: 0,
              storage_paid_at: 0,
              block_height: blockHeight,
              block_hash: blockHash,
            },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_account') {
        const accountId = String(params?.account_id || '');
        if (!accountsOnChain.has(accountId)) {
          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: 'UNKNOWN_ACCOUNT',
                data: 'UNKNOWN_ACCOUNT',
              },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              amount: '0',
              locked: '0',
              code_hash: '11111111111111111111111111111111',
              storage_usage: 0,
              storage_paid_at: 0,
              block_height: blockHeight,
              block_hash: blockHash,
            },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_access_key') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              block_hash: blockHash,
              block_height: blockHeight,
              nonce: 0,
              permission: 'FullAccess',
            },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_access_key_list') {
        const keys: any[] = [];
        if (localNearPublicKey) {
          keys.push({ public_key: localNearPublicKey, access_key: { nonce: 0, permission: 'FullAccess' } });
        }
        if (thresholdActivatedOnChain && thresholdPublicKey) {
          keys.push({ public_key: thresholdPublicKey, access_key: { nonce: 0, permission: 'FullAccess' } });
        }
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { keys },
          }),
        });
        return;
      }

      if (rpcMethod === 'send_tx') {
        sendTxCount += 1;
        thresholdActivatedOnChain = true;
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              status: { SuccessValue: '' },
              transaction: { hash: `mock-tx-${Date.now()}` },
              transaction_outcome: { id: `mock-tx-outcome-${Date.now()}` },
              receipts_outcome: [],
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ jsonrpc: '2.0', id, result: {} }),
      });
    });

    await page.route('**/create_account_and_register_user', async (route) => {
      const req = route.request();
      const method = req.method().toUpperCase();

      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        return;
      }

      const post = req.postData() || '{}';
      const payload = JSON.parse(post);
      localNearPublicKey = payload?.new_public_key || '';
      const accountId = String(payload?.new_account_id || '');
      if (accountId) {
        accountsOnChain.add(accountId);
      }
      const relayDigest = payload?.vrf_data?.intent_digest_32;
      if (Array.isArray(relayDigest)) {
        relayIntentDigest32 = relayDigest as number[];
      } else if (typeof relayDigest === 'string' && relayDigest) {
        relayIntentDigest32 = Array.from(Buffer.from(relayDigest, 'base64url'));
      }
      const clientVerifyingShareB64u = payload?.threshold_ed25519?.client_verifying_share_b64u || '';

      thresholdPublicKey = compute2of2GroupPk({
        clientVerifyingShareB64u,
        relayerVerifyingShareB64u,
      });

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          success: true,
          transactionHash: `mock_atomic_tx_${Date.now()}`,
          thresholdEd25519: {
            relayerKeyId,
            publicKey: thresholdPublicKey,
            relayerVerifyingShareB64u,
          },
        }),
      });
    });

    const registration = await page.evaluate(async () => {
      try {
        const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
        const suffix =
          (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const accountId = `e2e${suffix}.w3a-v1.testnet`;

        const pm = new TatchiPasskey({
          nearNetwork: 'testnet',
          nearRpcUrl: 'https://test.rpc.fastnear.com',
          contractId: 'w3a-v1.testnet',
          relayer: { url: 'http://localhost:3000' },
          iframeWallet: { walletOrigin: '' },
        });

        const confirmConfig = {
          uiMode: 'skip',
          behavior: 'autoProceed',
          autoProceedDelay: 0,
        };

        (window as any).__registrationEvents = [];
        const res = await pm.registerPasskeyInternal(
          accountId,
          {
            signerMode: { mode: 'threshold-signer' },
            onEvent: (event: any) => {
              try {
                (window as any).__registrationEvents.push(event);
              } catch {}
            },
          },
          confirmConfig as any,
        );

        return { accountId, success: !!res?.success, error: res?.error };
      } catch (error: any) {
        return { accountId: 'unknown', success: false, error: error?.message || String(error) };
      }
    });

    if (!registration.success) {
      throw new Error([
        `registration failed: ${registration.error || 'unknown'}`,
        '',
        'console:',
        ...consoleMessages.slice(-80),
      ].join('\n'));
    }

    // Threshold enrollment activation is fire-and-forget (post-registration); wait for it.
    await expect.poll(() => sendTxCount, { timeout: 10_000 }).toBe(1);

    expect(localNearPublicKey).toMatch(/^ed25519:/);
    expect(thresholdPublicKey).toMatch(/^ed25519:/);
    expect(relayIntentDigest32).toBeTruthy();
    expect(relayIntentDigest32).toHaveLength(32);
    // ConfirmTxFlow binds `sha256("register:<accountId>:<deviceNumber>")` into the VRF input.
    const expectedIntentDigest32 = Array.from(
      createHash('sha256')
        .update(`register:${registration.accountId}:1`, 'utf8')
        .digest(),
    );
    expect(relayIntentDigest32).toEqual(expectedIntentDigest32);

    // Wait for local vault to be updated with threshold material.
    await expect
      .poll(async () => {
        return await page.evaluate(async ({ paths, accountId }) => {
          const { PasskeyNearKeysDBManager } = await import(paths.nearKeysDb);
          const db = new PasskeyNearKeysDBManager();
          const rec = await db.getThresholdKeyMaterial(accountId, 1);
          return !!rec;
        }, { paths: IMPORT_PATHS, accountId: registration.accountId });
      }, { timeout: 10_000 })
      .toBe(true);

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const events = (window as any).__registrationEvents;
          if (!Array.isArray(events)) return null;
          return (
            events.find((e: any) => e?.phase === 'threshold-key-enrollment' && e?.thresholdKeyReady === true) ??
            null
          );
        });
      }, { timeout: 10_000 })
      .not.toBeNull();

    const thresholdReadyEvent = await page.evaluate(() => {
      const events = (window as any).__registrationEvents;
      if (!Array.isArray(events)) return null;
      return (
        events.find((e: any) => e?.phase === 'threshold-key-enrollment' && e?.thresholdKeyReady === true) ?? null
      );
    });

    expect(thresholdReadyEvent?.thresholdPublicKey).toBe(thresholdPublicKey);
    expect(thresholdReadyEvent?.relayerKeyId).toBe(relayerKeyId);

    const stored = await page.evaluate(async ({ paths, accountId }) => {
      const { PasskeyNearKeysDBManager } = await import(paths.nearKeysDb);
      const db = new PasskeyNearKeysDBManager();
      const rec = await db.getThresholdKeyMaterial(accountId, 1);
      return rec ? { ...rec } : null;
    }, { paths: IMPORT_PATHS, accountId: registration.accountId });

    expect(stored?.kind).toBe('threshold_ed25519_2p_v1');
    expect(stored?.publicKey).toBe(thresholdPublicKey);
    expect(stored?.relayerKeyId).toBe(relayerKeyId);
    expect(typeof stored?.wrapKeySalt).toBe('string');
    expect((stored?.wrapKeySalt || '').length).toBeGreaterThan(0);

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  });

  test('registration continues if relay returns mismatched threshold public key (no AddKey, no stored threshold material)', async ({ page }) => {
    let sendTxCount = 0;
    let localNearPublicKey = '';
    let thresholdActivatedOnChain = false;
    const accountsOnChain = new Set<string>();

    await page.route('**://test.rpc.fastnear.com/**', async (route) => {
      const req = route.request();
      const method = req.method().toUpperCase();
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        return;
      }
      if (method !== 'POST') return route.fallback();

      let body: any = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch {
        body = {};
      }

      const rpcMethod = body?.method;
      const params = body?.params || {};
      const id = body?.id ?? '1';
      const blockHash = bs58.encode(Buffer.alloc(32, 9));
      const blockHeight = 456;

      if (rpcMethod === 'block') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ jsonrpc: '2.0', id, result: { header: { hash: blockHash, height: blockHeight } } }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'call_function') {
        const resultBytes = Array.from(Buffer.from(JSON.stringify({ verified: true }), 'utf8'));
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ jsonrpc: '2.0', id, result: { result: resultBytes, logs: [] } }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_account') {
        const accountId = String(params?.account_id || '');
        if (!accountsOnChain.has(accountId)) {
          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: 'UNKNOWN_ACCOUNT',
                data: 'UNKNOWN_ACCOUNT',
              },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              amount: '0',
              locked: '0',
              code_hash: '11111111111111111111111111111111',
              storage_usage: 0,
              storage_paid_at: 0,
              block_height: blockHeight,
              block_hash: blockHash,
            },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_account') {
        const accountId = String(params?.account_id || '');
        if (!accountsOnChain.has(accountId)) {
          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: 'UNKNOWN_ACCOUNT',
                data: 'UNKNOWN_ACCOUNT',
              },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              amount: '0',
              locked: '0',
              code_hash: '11111111111111111111111111111111',
              storage_usage: 0,
              storage_paid_at: 0,
              block_height: blockHeight,
              block_hash: blockHash,
            },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_access_key') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { block_hash: blockHash, block_height: blockHeight, nonce: 0, permission: 'FullAccess' },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_access_key_list') {
        const keys: any[] = [];
        if (localNearPublicKey) keys.push({ public_key: localNearPublicKey, access_key: { nonce: 0, permission: 'FullAccess' } });
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ jsonrpc: '2.0', id, result: { keys } }),
        });
        return;
      }

      if (rpcMethod === 'send_tx') {
        sendTxCount += 1;
        thresholdActivatedOnChain = true;
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              status: { SuccessValue: '' },
              transaction: { hash: `mock-tx-${Date.now()}` },
              transaction_outcome: { id: `mock-tx-outcome-${Date.now()}` },
              receipts_outcome: [],
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ jsonrpc: '2.0', id, result: {} }),
      });
    });

    await page.route('**/create_account_and_register_user', async (route) => {
      const req = route.request();
      const method = req.method().toUpperCase();
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        return;
      }

      const payload = JSON.parse(req.postData() || '{}');
      localNearPublicKey = payload?.new_public_key || '';
      const accountId = String(payload?.new_account_id || '');
      if (accountId) {
        accountsOnChain.add(accountId);
      }

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          success: true,
          transactionHash: `mock_atomic_tx_${Date.now()}`,
          thresholdEd25519: {
            relayerKeyId: 'relayer-keyid-mock-2',
            publicKey: 'ed25519:11111111111111111111111111111111',
            relayerVerifyingShareB64u: toB64u(ed25519.Point.BASE.toBytes()),
          },
        }),
      });
    });

    const registration = await page.evaluate(async () => {
      try {
        const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
        const suffix =
          (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const accountId = `e2e${suffix}.w3a-v1.testnet`;

        const pm = new TatchiPasskey({
          nearNetwork: 'testnet',
          nearRpcUrl: 'https://test.rpc.fastnear.com',
          contractId: 'w3a-v1.testnet',
          relayer: { url: 'http://localhost:3000' },
          iframeWallet: { walletOrigin: '' },
        });

        const confirmConfig = {
          uiMode: 'skip',
          behavior: 'autoProceed',
          autoProceedDelay: 0,
        };

        (window as any).__registrationEvents = [];
        const res = await pm.registerPasskeyInternal(
          accountId,
          {
            signerMode: { mode: 'threshold-signer' },
            onEvent: (event: any) => {
              try {
                (window as any).__registrationEvents.push(event);
              } catch {}
            },
          },
          confirmConfig as any,
        );
        return { accountId, success: !!res?.success, error: res?.error };
      } catch (error: any) {
        return { accountId: 'unknown', success: false, error: error?.message || String(error) };
      }
    });

    expect(registration.success, registration.error || 'registration failed').toBe(true);

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const events = (window as any).__registrationEvents;
          if (!Array.isArray(events)) return null;
          return (
            events.find((e: any) => e?.phase === 'threshold-key-enrollment' && e?.thresholdKeyReady === false) ??
            null
          );
        });
      }, { timeout: 10_000 })
      .not.toBeNull();

    const thresholdNotReadyEvent = await page.evaluate(() => {
      const events = (window as any).__registrationEvents;
      if (!Array.isArray(events)) return null;
      return (
        events.find((e: any) => e?.phase === 'threshold-key-enrollment' && e?.thresholdKeyReady === false) ?? null
      );
    });

    expect(thresholdNotReadyEvent?.thresholdKeyReady).toBe(false);

    expect(sendTxCount).toBe(0);
    expect(thresholdActivatedOnChain).toBe(false);

    const stored = await page.evaluate(async ({ paths, accountId }) => {
      const { PasskeyNearKeysDBManager } = await import(paths.nearKeysDb);
      const db = new PasskeyNearKeysDBManager();
      const rec = await db.getThresholdKeyMaterial(accountId, 1);
      return rec ? { ...rec } : null;
    }, { paths: IMPORT_PATHS, accountId: registration.accountId });

    expect(stored).toBeNull();
  });
});
