#!/usr/bin/env node
/**
 * Provision a funded relayer account and Shamir keys for the example relay server.
 *
 * - Generates a fresh Ed25519 keypair (NEAR format)
 * - Calls the NEAR testnet faucet to create and fund a new account
 * - Generates Shamir 3-pass server keys (p, e_s, d_s)
 * - Writes/updates examples/relay-server/.env with required variables
 * - Ensures grace-keys.json exists and is referenced
 *
 * Idempotent: if a valid .env already exists with required values, it skips work.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Local deps from passkey-sdk package
import bs58 from 'bs58';
import * as ed from '@noble/ed25519';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(path.join(__dirname, '../../..'));
const RELAY_DIR = path.join(ROOT, 'examples', 'relay-server');
const DOTENV_PATH = path.join(RELAY_DIR, '.env');
// Allow overriding artifact paths via env to keep workspace clean (e.g., playwright-report)
const DEFAULT_GRACE_FILE = path.join(RELAY_DIR, 'grace-keys.json');
const DEFAULT_CACHE_FILE = path.join(RELAY_DIR, '.provision-cache.json');
const GRACE_FILE_PATH = process.env.SHAMIR_GRACE_KEYS_FILE || DEFAULT_GRACE_FILE;
const CACHE_PATH = process.env.RELAY_PROVISION_CACHE_PATH || DEFAULT_CACHE_FILE;

const REQUIRED_ENV_KEYS = [
  'RELAYER_ACCOUNT_ID',
  'RELAYER_PRIVATE_KEY',
  'SHAMIR_P_B64U',
  'SHAMIR_E_S_B64U',
  'SHAMIR_D_S_B64U',
];

/** Parse a .env style file into an object */
async function readDotEnv(file) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    const lines = txt.split(/\r?\n/);
    const out = {};
    for (const line of lines) {
      const m = /^(\w+)=(.*)$/.exec(line.trim());
      if (!m) continue;
      out[m[1]] = m[2];
    }
    return out;
  } catch (e) {
    return {};
  }
}

function toEnvText(envObj) {
  return Object.entries(envObj)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
}

function hasAllEnv(env) {
  return REQUIRED_ENV_KEYS.every((k) => typeof env[k] === 'string' && env[k].length > 0);
}

function randomSuffix(n = 8) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);
}

async function ensureGraceFile() {
  try {
    await fs.access(GRACE_FILE_PATH);
  } catch {
    try {
      await fs.mkdir(path.dirname(GRACE_FILE_PATH), { recursive: true });
    } catch {}
    await fs.writeFile(GRACE_FILE_PATH, '[]\n', 'utf8');
  }
}

async function readCache() {
  try {
    const txt = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function writeCache(data) {
  try { await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true }); } catch {}
  await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ttlMsFromEnv() {
  // Default to a long TTL so local test runs don't re-provision a relayer account
  // (which can be slow and rate-limited) on every invocation.
  const mins = Number(process.env.RELAY_PROVISION_TTL_MINUTES || '720');
  if (!Number.isFinite(mins) || mins <= 0) return 720 * 60_000;
  return mins * 60_000;
}

async function verifyNearAccountExists(accountId) {
  const url = 'https://test.rpc.fastnear.com';
  const body = {
    jsonrpc: '2.0',
    id: 'check-account',
    method: 'query',
    params: { request_type: 'view_account', finality: 'final', account_id: accountId },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json?.result;
  } catch {
    // If RPC is flaky, don't block reuse
    return true;
  }
}

/**
 * Generate NEAR-format keypair from Ed25519 private key
 * private: ed25519:base58(32-byte seed || 32-byte public)
 * public:  ed25519:base58(32-byte public)
 */
async function generateNearKeypair() {
  const priv32 = ed.utils.randomPrivateKey();
  const pub32 = await ed.getPublicKeyAsync(priv32);
  const sk64 = new Uint8Array(64);
  sk64.set(priv32, 0);
  sk64.set(pub32, 32);
  const nearPrivateKey = `ed25519:${bs58.encode(sk64)}`;
  const nearPublicKey = `ed25519:${bs58.encode(pub32)}`;
  return { nearPrivateKey, nearPublicKey };
}

async function faucetCreateAccount(accountId, publicKey) {
  const url = 'https://helper.nearprotocol.com/account';
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
    }).catch((e) => ({ ok: false, status: 0, statusText: 'network', text: async () => String(e) }));

    if (res && res.ok) {
      const json = await res.json().catch(() => ({}));
      if (!json.error && json.status !== 'error') return json;
      lastError = new Error(`Faucet response error: ${JSON.stringify(json)}`);
    } else {
      const txt = res && typeof res.text === 'function' ? await res.text().catch(() => '') : '';
      lastError = new Error(`Faucet error: ${res?.status ?? '0'} ${res?.statusText ?? ''} ${txt}`);
    }

    const backoff = 500 * attempt;
    console.warn(`[provision] Faucet attempt ${attempt} failed. Retrying in ${backoff}ms...`);
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw lastError || new Error('Faucet error');
}

async function generateShamirKeys() {
  // Import compiled ESM server utils directly from built dist
  // Assumes passkey-sdk build ran before this script
  const { Shamir3PassUtils } = await import('../../../dist/esm/server/index.js');
  const utils = new Shamir3PassUtils({});
  const { p_b64u } = await utils.initialize();
  const { e_s_b64u, d_s_b64u } = await utils.generateServerKeypair();
  return { p_b64u, e_s_b64u, d_s_b64u };
}

async function main() {
  console.log('[provision] Checking relay-server .env');
  const env = await readDotEnv(DOTENV_PATH);
  const writeDotEnv = process.env.PROVISION_WRITE_DOTENV === '1' || process.env.PROVISION_WRITE_DOTENV === 'true';

  const reuseExisting = process.env.REUSE_EXISTING_RELAY_ENV === '1' || process.env.REUSE_EXISTING_RELAY_ENV === 'true';
  const forceReprovision = process.env.FORCE_RELAY_REPROVISION === '1' || process.env.FORCE_RELAY_REPROVISION === 'true';

  if (reuseExisting && hasAllEnv(env)) {
    console.log('[provision] REUSE_EXISTING_RELAY_ENV is set and .env has values; skipping provisioning');
    return;
  }

  // Try cache reuse first (unless forced)
  if (!forceReprovision) {
    const cache = await readCache();
    const ttlMs = ttlMsFromEnv();
    const now = Date.now();
    if (cache && cache.createdAt && (now - Number(new Date(cache.createdAt))) < ttlMs) {
      const exists = await verifyNearAccountExists(cache.accountId);
      if (exists) {
        console.log(`[provision] Using cached relayer within TTL (${Math.round((ttlMs - (now - new Date(cache.createdAt).getTime()))/60000)}m left)`);
        await ensureGraceFile();
        if (writeDotEnv) {
          const next = {
            RELAYER_ACCOUNT_ID: cache.accountId,
            RELAYER_PRIVATE_KEY: cache.nearPrivateKey,
            NEAR_NETWORK_ID: 'testnet',
            NEAR_RPC_URL: env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
            PORT: env.PORT || '3000',
            EXPECTED_ORIGIN: env.EXPECTED_ORIGIN || 'https://example.localhost',
            EXPECTED_WALLET_ORIGIN: env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
            SHAMIR_P_B64U: cache.shamir?.p_b64u,
            SHAMIR_E_S_B64U: cache.shamir?.e_s_b64u,
            SHAMIR_D_S_B64U: cache.shamir?.d_s_b64u,
            SHAMIR_GRACE_KEYS_FILE: env.SHAMIR_GRACE_KEYS_FILE || './grace-keys.json',
            ROTATE_EVERY: env.ROTATE_EVERY || '60',
          };
          await fs.writeFile(DOTENV_PATH, toEnvText(next), 'utf8');
          console.log('[provision] Updated relay-server .env from cache (PROVISION_WRITE_DOTENV=1)');
        }
        return;
      } else {
        console.warn('[provision] Cached relayer account missing on RPC; re-provisioning');
      }
    }
  }

  // 1) Generate relayer keys & account id
  const { nearPrivateKey, nearPublicKey } = await generateNearKeypair();
  const accountId = `relayer-${randomSuffix(10)}.testnet`;
  console.log(`[provision] Generated keypair for ${accountId}`);

  // 2) Fund account via faucet
  console.log('[provision] Requesting testnet faucet funding...');
  await faucetCreateAccount(accountId, nearPublicKey);
  console.log('[provision] Faucet created and funded account');

  // 3) Generate Shamir 3-pass keys
  console.log('[provision] Generating Shamir 3-pass server keys');
  const { p_b64u, e_s_b64u, d_s_b64u } = await generateShamirKeys();

  // 4) Ensure grace file exists
  await ensureGraceFile();

  // 5) Optionally write .env for manual/example usage
  if (writeDotEnv) {
    const next = {
      ...env,
      RELAYER_ACCOUNT_ID: accountId,
      RELAYER_PRIVATE_KEY: nearPrivateKey,
      NEAR_NETWORK_ID: 'testnet',
      NEAR_RPC_URL: env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
      PORT: env.PORT || '3000',
      EXPECTED_ORIGIN: env.EXPECTED_ORIGIN || 'https://example.localhost',
      EXPECTED_WALLET_ORIGIN: env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
      SHAMIR_P_B64U: p_b64u,
      SHAMIR_E_S_B64U: e_s_b64u,
      SHAMIR_D_S_B64U: d_s_b64u,
      SHAMIR_GRACE_KEYS_FILE: env.SHAMIR_GRACE_KEYS_FILE || './grace-keys.json',
      ROTATE_EVERY: env.ROTATE_EVERY || '60',
    };
    await fs.writeFile(DOTENV_PATH, toEnvText(next), 'utf8');
    console.log('[provision] Wrote relay-server .env with relayer + Shamir keys (PROVISION_WRITE_DOTENV=1)');
    console.log(`[provision] RELAYER_ACCOUNT_ID=${accountId}`);
  }

  // 6) Persist cache for TTL reuse
  const cache = {
    createdAt: new Date().toISOString(),
    accountId,
    nearPrivateKey,
    nearPublicKey,
    shamir: { p_b64u, e_s_b64u, d_s_b64u },
  };
  await writeCache(cache);
}

main().catch((err) => {
  console.error('[provision] Failed:', err?.message || err);
  process.exit(1);
});
