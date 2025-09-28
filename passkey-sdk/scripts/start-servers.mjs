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

const ROOT = path.resolve(path.join(import.meta.url.replace('file://', ''), '../../..'));
const RELAY_DIR = path.join(ROOT, 'examples', 'relay-server');
const CACHE_PATH = path.join(RELAY_DIR, '.provision-cache.json');

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
  await runWait('node', ['./scripts/provision-relay-server.mjs']);

  // 2) Build inline config json for relay
  const cache = await readCache(CACHE_PATH);
  if (!cache) throw new Error('missing provision cache');
  const relayConfig = {
    authService: {
      relayerAccountId: cache.accountId,
      relayerPrivateKey: cache.nearPrivateKey,
      webAuthnContractId: 'web3-authn-v5.testnet',
      nearRpcUrl: 'https://test.rpc.fastnear.com',
      networkId: 'testnet',
      accountInitialBalance: '30000000000000000000000',
      createAccountAndRegisterGas: '85000000000000',
      shamir: {
        shamir_p_b64u: cache.shamir?.p_b64u,
        shamir_e_s_b64u: cache.shamir?.e_s_b64u,
        shamir_d_s_b64u: cache.shamir?.d_s_b64u,
        graceShamirKeysFile: './grace-keys.json',
      },
    },
    server: {
      port: Number(process.env.RELAY_PORT || '3000'),
      expectedOrigin: process.env.EXPECTED_ORIGIN || 'https://example.localhost',
      expectedWalletOrigin: process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
      rotateEveryMinutes: Number(process.env.ROTATE_EVERY || '60'),
    },
  };

  // 3) Start relay dev in background with inline bootstrap config
  const relayEnv = { ...process.env, RELAY_CONFIG_JSON: JSON.stringify(relayConfig) };
  const relay = spawn('pnpm', ['-C', 'examples/relay-server', 'dev'], { stdio: 'inherit', cwd: ROOT, env: relayEnv });

  // 4) Determine port and wait for health
  const port = Number(relayConfig.server.port || 3000);
  await waitForRelayHealth(port).catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });

  // 5) Start vite dev (foreground)
  const vite = spawn('pnpm', ['-C', 'examples/vite', 'dev'], { stdio: 'inherit', cwd: ROOT });

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
