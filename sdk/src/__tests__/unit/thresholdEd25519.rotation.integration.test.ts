import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519.js';

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

test.describe('Threshold Ed25519 rotation helper', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    // This test runs in a same-origin "blank page" harness so we can:
    // - use WebAuthn virtual authenticator + PRF
    // - intercept network calls deterministically (NEAR RPC + relayer endpoints)
    // - read/write IndexedDB (PasskeyNearKeysDB) inside the test page
    const blankPageUrl = new URL('/__test_blank.html', DEFAULT_TEST_CONFIG.frontendUrl).toString();
    await setupBasicPasskeyTest(page, {
      frontendUrl: blankPageUrl,
      skipPasskeyManagerInit: true,
    });

    // setupBasicPasskeyTest() skips bootstrap global fallbacks when tatchi init is skipped.
    // The WebAuthn mocks expect base64UrlEncode/base64UrlDecode to exist on window.
    await page.evaluate(async () => {
      const { base64UrlEncode, base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
      (window as any).base64UrlEncode = base64UrlEncode;
      (window as any).base64UrlDecode = base64UrlDecode;
    });
  });

  test('rotateThresholdEd25519Key performs keygen → AddKey(new) → DeleteKey(old)', async ({ page }) => {
    // What this test validates (end-to-end in browser, with mocked network):
    //
    // 1) Registration (signerMode=threshold-signer) performs Option B:
    //    - relayer returns `{ relayerKeyId, thresholdPublicKey, relayerVerifyingShare }` from
    //      `/create_account_and_register_user`
    //    - SDK submits `AddKey(thresholdPublicKeyOld)` on-chain using the freshly obtained PRF-bearing credential
    //      (no extra prompt) and stores `threshold_ed25519_2p_v1` key material locally.
    //
    // 2) Rotation (`pm.rotateThresholdEd25519Key`) performs:
    //    - `/threshold-ed25519/keygen` to get `{ relayerKeyIdNew, thresholdPublicKeyNew, relayerVerifyingShareNew }`
    //    - submits `AddKey(thresholdPublicKeyNew)` (local signer)
    //    - submits `DeleteKey(thresholdPublicKeyOld)` (local signer)
    //    - updates local vault (`threshold_ed25519_2p_v1`) to the new public key + new relayerKeyId.
    //
    // Note: This does NOT test the threshold/FROST signing protocol itself (that is separate from enrollment/rotation).
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
    let thresholdPublicKeyOld = '';
    let thresholdPublicKeyNew = '';
    const relayerKeyIdOld = 'relayer-keyid-mock-old';
    const relayerKeyIdNew = 'relayer-keyid-mock-new';

    const relayerVerifyingShareB64uOld = toB64u(ed25519.Point.BASE.toBytes());
    const relayerVerifyingShareB64uNew = toB64u(ed25519.Point.BASE.multiply(3n).toBytes());

    const thresholdKeysOnChain = new Set<string>();

    await page.route('**://test.rpc.fastnear.com/**', async (route) => {
      // Mock NEAR JSON-RPC:
      // - `block` provides height/hash for VRF freshness and tx context
      // - `call_function` verifies VRF/WebAuthn on-chain (always { verified: true } for this test)
      // - `view_access_key` provides nonce for tx signing
      // - `view_access_key_list` is used to confirm AddKey/DeleteKey effects
      // - `send_tx` is called when we actually submit signed transactions
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

      const blockHash = bs58.encode(Buffer.alloc(32, 5));
      const blockHeight = 999;

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

      if (rpcMethod === 'query' && params?.request_type === 'view_access_key') {
        const requestedPk = String(params?.public_key || '').trim();
        const isKnown =
          (!!requestedPk && requestedPk === localNearPublicKey)
          || (!!requestedPk && thresholdKeysOnChain.has(requestedPk));

        if (!isKnown) {
          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: 'Unknown Access Key',
                data: {
                  message: `Unknown Access Key: ${requestedPk || '<empty>'}`,
                },
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
              block_hash: blockHash,
              block_height: blockHeight,
              nonce: sendTxCount,
              permission: 'FullAccess',
            },
          }),
        });
        return;
      }

      if (rpcMethod === 'query' && params?.request_type === 'view_access_key_list') {
        const keys: any[] = [];
        if (localNearPublicKey) {
          keys.push({ public_key: localNearPublicKey, access_key: { nonce: sendTxCount, permission: 'FullAccess' } });
        }
        for (const pk of thresholdKeysOnChain) {
          keys.push({ public_key: pk, access_key: { nonce: 0, permission: 'FullAccess' } });
        }
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ jsonrpc: '2.0', id, result: { keys } }),
        });
        return;
      }

      if (rpcMethod === 'send_tx') {
        // We expect 3 transactions total:
        // 1) registration: AddKey(old threshold public key) (Option B activation)
        // 2) rotation: AddKey(new threshold public key)
        // 3) rotation: DeleteKey(old threshold public key)
        sendTxCount += 1;
        if (sendTxCount === 1 && thresholdPublicKeyOld) {
          thresholdKeysOnChain.add(thresholdPublicKeyOld);
        }
        if (sendTxCount === 2 && thresholdPublicKeyNew) {
          thresholdKeysOnChain.add(thresholdPublicKeyNew);
        }
        if (sendTxCount === 3 && thresholdPublicKeyOld) {
          thresholdKeysOnChain.delete(thresholdPublicKeyOld);
        }
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
      // Mock the relayer "registration" endpoint:
      // it returns the server share metadata and the computed group public key.
      // The SDK uses this to activate threshold enrollment on-chain (AddKey) after registration.
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
      const clientVerifyingShareB64u = payload?.threshold_ed25519?.client_verifying_share_b64u || '';

      thresholdPublicKeyOld = compute2of2GroupPk({
        clientVerifyingShareB64u,
        relayerVerifyingShareB64u: relayerVerifyingShareB64uOld,
      });

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          success: true,
          transactionHash: `mock_atomic_tx_${Date.now()}`,
          thresholdEd25519: {
            relayerKeyId: relayerKeyIdOld,
            publicKey: thresholdPublicKeyOld,
            relayerVerifyingShareB64u: relayerVerifyingShareB64uOld,
          },
        }),
      });
    });

    await page.route('**/threshold-ed25519/keygen', async (route) => {
      // Mock the relayer keygen endpoint used during rotation.
      // IMPORTANT: the SDK uses `credentials: 'include'`, so for CORS we must echo Origin
      // and set `Access-Control-Allow-Credentials: true` to satisfy the browser.
      const req = route.request();
      const method = req.method().toUpperCase();
      const origin = req.headers()['origin'] || req.headers()['Origin'] || '';
      const corsHeaders = {
        // This endpoint is called with `credentials: 'include'`, so we must echo the origin.
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...(origin ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
      };
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        return;
      }

      const payload = JSON.parse(req.postData() || '{}');
      const clientVerifyingShareB64u = String(payload?.clientVerifyingShareB64u || '');

      thresholdPublicKeyNew = compute2of2GroupPk({
        clientVerifyingShareB64u,
        relayerVerifyingShareB64u: relayerVerifyingShareB64uNew,
      });

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          ok: true,
          relayerKeyId: relayerKeyIdNew,
          publicKey: thresholdPublicKeyNew,
          relayerVerifyingShareB64u: relayerVerifyingShareB64uNew,
        }),
      });
    });

    const result = await page.evaluate(async () => {
      // Run the SDK flow inside the browser context:
      // - register a passkey-backed account with signerMode=threshold-signer (Option B)
      // - rotate the threshold key and return the helper output for assertions
      try {
        const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
        const { PasskeyNearKeysDBManager } = await import('/sdk/esm/core/IndexedDBManager/passkeyNearKeysDB.js');
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

        const reg = await pm.registerPasskeyInternal(
          accountId,
          { signerMode: { mode: 'threshold-signer' } },
          confirmConfig as any,
        );
        if (!reg?.success) {
          return { ok: false, accountId, error: reg?.error || 'registration failed' };
        }

        // Registration triggers threshold enrollment activation in the background (Option B AddKey).
        // Rotation requires the old threshold key material to already be stored.
        const db = new PasskeyNearKeysDBManager();
        const start = Date.now();
        const maxWaitMs = 10_000;
        while (Date.now() - start < maxWaitMs) {
          const existing = await db.getThresholdKeyMaterial(accountId, 1).catch(() => null);
          if (existing) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        const existing = await db.getThresholdKeyMaterial(accountId, 1).catch(() => null);
        if (!existing) {
          return { ok: false, accountId, error: 'threshold enrollment did not complete in time' };
        }

        const rotated = await pm.rotateThresholdEd25519Key(accountId, { deviceNumber: 1 });
        return { ok: true, accountId, rotated };
      } catch (error: any) {
        return { ok: false, accountId: 'unknown', error: error?.message || String(error) };
      }
    });

    if (!result.ok) {
      throw new Error([
        `rotation test failed: ${result.error || 'unknown'}`,
        '',
        'console:',
        ...consoleMessages.slice(-120),
      ].join('\n'));
    }

    // Assertions:
    // - transaction count reflects {AddKey old, AddKey new, DeleteKey old}
    // - on-chain "key list" reflects the new key only
    // - local DB reflects the new threshold material
    expect(sendTxCount).toBe(3);
    expect(localNearPublicKey).toMatch(/^ed25519:/);
    expect(thresholdPublicKeyOld).toMatch(/^ed25519:/);
    expect(thresholdPublicKeyNew).toMatch(/^ed25519:/);
    expect(thresholdPublicKeyNew).not.toBe(thresholdPublicKeyOld);

    const rotated = result.rotated as any;
    expect(rotated?.success).toBe(true);
    expect(rotated?.oldPublicKey).toBe(thresholdPublicKeyOld);
    expect(rotated?.oldRelayerKeyId).toBe(relayerKeyIdOld);
    expect(rotated?.publicKey).toBe(thresholdPublicKeyNew);
    expect(rotated?.relayerKeyId).toBe(relayerKeyIdNew);
    expect(rotated?.deleteOldKeyAttempted).toBe(true);
    expect(rotated?.deleteOldKeySuccess).toBe(true);

    expect(Array.from(thresholdKeysOnChain)).toEqual([thresholdPublicKeyNew]);

    const stored = await page.evaluate(async ({ paths, accountId }) => {
      const { PasskeyNearKeysDBManager } = await import(paths.nearKeysDb);
      const db = new PasskeyNearKeysDBManager();
      const rec = await db.getThresholdKeyMaterial(accountId, 1);
      return rec ? { ...rec } : null;
    }, { paths: IMPORT_PATHS, accountId: result.accountId });

    expect(stored?.kind).toBe('threshold_ed25519_2p_v1');
    expect(stored?.publicKey).toBe(thresholdPublicKeyNew);
    expect(stored?.relayerKeyId).toBe(relayerKeyIdNew);
    expect(typeof stored?.wrapKeySalt).toBe('string');
    expect((stored?.wrapKeySalt || '').length).toBeGreaterThan(0);

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  });
});
