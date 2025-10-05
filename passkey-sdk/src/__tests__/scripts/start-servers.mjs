#!/usr/bin/env node
/**
 * Start both relay-server and vite dev servers with health check for relay.
 * - Runs provision-relay-server first (with TTL cache)
 * - Spawns relay dev server and waits for /shamir/key-info to be ready
 * - Spawns vite dev server in foreground (so Playwright webServer can track it)
 * - Propagates signals, cleans up children on exit
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(path.join(__dirname, '../../..'));
const RELAY_DIR = path.join(ROOT, 'examples', 'relay-server');
const DEFAULT_CACHE_PATH = path.join(RELAY_DIR, '.provision-cache.json');
const REPORT_DIR = path.join(ROOT, 'passkey-sdk', 'playwright-report');
const CACHE_PATH = process.env.RELAY_PROVISION_CACHE_PATH || path.join(REPORT_DIR, 'relay-provision-cache.json');

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  return p;
}

function runWait(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
    p.on('exit', (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited with ${code}`));
      else resolve(undefined);
    });
    p.on('error', reject);
  });
}

async function readCache(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function waitForRelayHealth(port, timeoutMs = 120_000) {
  const started = Date.now();
  const url = `http://localhost:${port}/shamir/key-info`;
  let attempt = 0;
  while (Date.now() - started < timeoutMs) {
    attempt++;
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        console.log(`[start-servers] Relay health OK after ${attempt} attempts`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`[start-servers] Relay server not healthy within ${timeoutMs}ms`);
}

async function main() {
  // 1) Provision relayer + shamir keys
  await runWait('node', ['./src/__tests__/scripts/provision-relay-server.mjs'], {
    env: { ...process.env, RELAY_PROVISION_CACHE_PATH: CACHE_PATH }
  });

  // 2) Build environment variables for relay (do not require .env)
  const cache = await readCache(CACHE_PATH || DEFAULT_CACHE_PATH);
  if (!cache) throw new Error('missing provision cache');
  const relayPort = Number(process.env.RELAY_PORT || '3000');
  const NO_CADDY = process.env.NO_CADDY === '1' || process.env.VITE_NO_CADDY === '1' || process.env.CI === '1';
  const defaultOrigin = NO_CADDY ? 'http://localhost:5173' : 'https://example.localhost';
  const relayEnv = {
    ...process.env,
    PORT: String(relayPort),
    RELAYER_ACCOUNT_ID: cache.accountId,
    RELAYER_PRIVATE_KEY: cache.nearPrivateKey,
    NEAR_NETWORK_ID: 'testnet',
    NEAR_RPC_URL: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
    // Allow CORS for the actual frontend origin used in tests
    EXPECTED_ORIGIN: process.env.EXPECTED_ORIGIN || defaultOrigin,
    EXPECTED_WALLET_ORIGIN: process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
    ROTATE_EVERY: process.env.ROTATE_EVERY || '60',
    SHAMIR_P_B64U: cache.shamir?.p_b64u,
    SHAMIR_E_S_B64U: cache.shamir?.e_s_b64u,
    SHAMIR_D_S_B64U: cache.shamir?.d_s_b64u,
    // Put grace keys alongside the report unless overridden
    SHAMIR_GRACE_KEYS_FILE: process.env.SHAMIR_GRACE_KEYS_FILE || path.join(REPORT_DIR, 'grace-keys.json'),
    RELAY_PROVISION_CACHE_PATH: CACHE_PATH,
  };

  // 3) Start test relay server in background (self-contained)
  const relay = spawn('node', ['./src/__tests__/scripts/test-relay-server.mjs'], { stdio: 'inherit', cwd: ROOT, env: relayEnv });

  // 4) Determine port and wait for health
  const port = relayPort;
  await waitForRelayHealth(port).catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });

  // 5) Start vite dev (foreground)
  const viteScript = (process.env.NO_CADDY === '1' || process.env.VITE_NO_CADDY === '1' || process.env.CI === '1') ? 'dev:ci' : 'dev';
  console.log(`[start-servers] Starting Vite with script '${viteScript}' (NO_CADDY=${process.env.NO_CADDY || ''}, CI=${process.env.CI || ''})`);
  const vite = spawn('pnpm', ['-C', '../examples/vite', viteScript], { stdio: 'inherit', cwd: ROOT });

  // Cleanup on exit
  function shutdown(code = 0) {
    try { relay.kill(); } catch {}
    try { vite.kill(); } catch {}
    process.exit(code);
  }
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  vite.on('exit', (code) => shutdown(code ?? 0));
}

main().catch((err) => {
  console.error('[start-servers] Failed:', err?.message || err);
  process.exit(1);
});
