#!/usr/bin/env node
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

// Import from built SDK to avoid TS transpilation for tests
import { AuthService } from '../../../dist/esm/server/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(path.join(__dirname, '../../..'));
const RELAY_DIR = path.join(ROOT, 'examples', 'relay-server');
const DEFAULT_CACHE = path.join(RELAY_DIR, '.provision-cache.json');
const DEFAULT_GRACE = path.join(RELAY_DIR, 'grace-keys.json');
const CACHE_PATH = process.env.RELAY_PROVISION_CACHE_PATH || DEFAULT_CACHE;
const GRACE_FILE_PATH = process.env.SHAMIR_GRACE_KEYS_FILE || DEFAULT_GRACE;

async function readCache() {
  const txt = await fs.readFile(CACHE_PATH, 'utf8');
  return JSON.parse(txt);
}

async function ensureGraceFile() {
  try { await fs.access(GRACE_FILE_PATH); }
  catch {
    try { await fs.mkdir(path.dirname(GRACE_FILE_PATH), { recursive: true }); } catch {}
    await fs.writeFile(GRACE_FILE_PATH, '[]\n', 'utf8');
  }
}

async function main() {
  const cache = await readCache();
  await ensureGraceFile();

  const config = {
    relayerAccountId: cache.accountId,
    relayerPrivateKey: cache.nearPrivateKey,
    webAuthnContractId: 'w3a-v1.testnet',
    nearRpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
    networkId: 'testnet',
    accountInitialBalance: '30000000000000000000000',
    createAccountAndRegisterGas: '85000000000000',
    shamir: {
      shamir_p_b64u: cache.shamir?.p_b64u,
      shamir_e_s_b64u: cache.shamir?.e_s_b64u,
      shamir_d_s_b64u: cache.shamir?.d_s_b64u,
      graceShamirKeysFile: GRACE_FILE_PATH,
    },
  };

  const authService = new AuthService(config);

  const port = Number(process.env.RELAY_PORT || '3000');
  const allowedOrigins = [
    process.env.EXPECTED_ORIGIN || 'https://example.localhost',
    process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
  ].filter(Boolean);

  const setCors = (res) => {
    const origin = allowedOrigins[0] || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  };

  const readJson = async (req) => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });

  const sendJson = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 200; return res.end();
    }
    const url = new URL(req.url, `http://localhost:${port}`);
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/shamir/key-info') {
        const out = await authService.handleGetShamirKeyInfo();
        return sendJson(res, out.status, JSON.parse(out.body));
      }
      if (req.method === 'POST' && url.pathname === '/vrf/apply-server-lock') {
        const body = await readJson(req);
        const out = await authService.handleApplyServerLock({ body });
        return sendJson(res, out.status, JSON.parse(out.body));
      }
      if (req.method === 'POST' && url.pathname === '/vrf/remove-server-lock') {
        const body = await readJson(req);
        const out = await authService.handleRemoveServerLock({ body });
        return sendJson(res, out.status, JSON.parse(out.body));
      }
      if (req.method === 'POST' && url.pathname === '/create_account_and_register_user') {
        const body = await readJson(req);
        const {
          new_account_id,
          new_public_key,
          threshold_ed25519,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options
        } = body || {};
        if (!new_account_id || !new_public_key || !vrf_data || !webauthn_registration) {
          return sendJson(res, 400, { success: false, error: 'missing required fields' });
        }
        const result = await authService.createAccountAndRegisterUser({
          new_account_id,
          new_public_key,
          threshold_ed25519,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options
        });
        return sendJson(res, result.success ? 200 : 400, result);
      }
      sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
      sendJson(res, 500, { error: 'internal', details: e?.message });
    }
  });

  server.listen(port, () => {
    console.log(`[test-relay] listening on http://localhost:${port}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
