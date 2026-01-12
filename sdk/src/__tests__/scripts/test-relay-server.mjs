#!/usr/bin/env node
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

// Import from built SDK to avoid TS transpilation for tests
import {
  AuthService,
  createThresholdSigningService,
  handleApplyServerLock,
  handleGetShamirKeyInfo,
  handleRemoveServerLock,
} from '../../../dist/esm/server/index.js';

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
  // Ensure the Shamir service is initialized early so the test harness health check
  // (`/shamir/key-info`) can succeed before Playwright starts running tests.
  try {
    await authService.shamirService?.ensureReady?.();
  } catch { }

  // Test harness: skip on-chain WebAuthn authentication verification for relayer routes.
  // The Playwright suite already validates client-side behavior (and often bypasses
  // contract verification for determinism); keeping the relay permissive avoids
  // failures caused by browser WebAuthn mock signature differences.
  try {
    authService.verifyAuthenticationResponse = async () => ({ success: true, verified: true });
  } catch { }

  // Threshold signing services (in-memory stores are sufficient for test runs).
  const threshold = createThresholdSigningService({
    authService,
    thresholdEd25519KeyStore: { kind: 'in-memory' },
    logger: null,
  });

  const port = Number(process.env.RELAY_PORT || '3000');
  const allowedOrigins = [
    process.env.EXPECTED_ORIGIN || 'https://example.localhost',
    process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
  ].filter(Boolean);

  const setCors = (req, res) => {
    const requestOrigin = String(req.headers?.origin || '');
    const allowOrigin =
      requestOrigin && allowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : (allowedOrigins[0] || '*');

    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    if (allowOrigin !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
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

  const thresholdStatus = (result) => {
    if (result?.ok) return 200;
    switch (result?.code) {
      case 'threshold_disabled':
        return 503;
      case 'internal':
        return 500;
      case 'unauthorized':
        return 401;
      default:
        return 400;
    }
  };

  const server = createServer(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 200; return res.end();
    }
    const url = new URL(req.url, `http://localhost:${port}`);
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/threshold-ed25519/healthz') {
        return sendJson(res, 200, { ok: true, configured: true });
      }
      if (req.method === 'GET' && url.pathname === '/shamir/key-info') {
        const shamir = authService.shamirService;
        if (!shamir || !shamir.hasShamir?.()) {
          return sendJson(res, 503, { error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
        }
        const out = await handleGetShamirKeyInfo(shamir);
        return sendJson(res, out.status, JSON.parse(out.body));
      }
      if (req.method === 'POST' && url.pathname === '/threshold-ed25519/keygen') {
        const body = await readJson(req);
        const out = await threshold.thresholdEd25519Keygen(body);
        return sendJson(res, thresholdStatus(out), out);
      }
      if (req.method === 'POST' && url.pathname === '/vrf/apply-server-lock') {
        const body = await readJson(req);
        const shamir = authService.shamirService;
        if (!shamir || !shamir.hasShamir?.()) {
          return sendJson(res, 503, { error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
        }
        const out = await handleApplyServerLock(shamir, { body });
        return sendJson(res, out.status, JSON.parse(out.body));
      }
      if (req.method === 'POST' && url.pathname === '/vrf/remove-server-lock') {
        const body = await readJson(req);
        const shamir = authService.shamirService;
        if (!shamir || !shamir.hasShamir?.()) {
          return sendJson(res, 503, { error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
        }
        const out = await handleRemoveServerLock(shamir, { body });
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
