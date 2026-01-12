#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
  p.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });
  return p;
}

function requireEnv(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) {
    console.error(`[relay-server] Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const masterSecretB64u = requireEnv('THRESHOLD_ED25519_MASTER_SECRET_B64U');
const coordinatorSharedSecretB64u =
  String(process.env.THRESHOLD_COORDINATOR_SHARED_SECRET_B64U || '').trim()
  || crypto.randomBytes(32).toString('base64url');

// Run TypeScript compiler in watch mode once.
const tsc = run('pnpm', ['run', 'build:watch']);

// Coordinator talks to cosigners over direct localhost HTTP to avoid TLS trust issues
// (Caddy still provides the browser-facing HTTPS origins).
const relayerCosignersJson = JSON.stringify([
  { cosignerId: 1, relayerUrl: 'http://127.0.0.1:3000' },
  { cosignerId: 2, relayerUrl: 'http://127.0.0.1:3001' },
  { cosignerId: 3, relayerUrl: 'http://127.0.0.1:3002' },
]);

const commonEnv = {
  ...process.env,
  THRESHOLD_COORDINATOR_SHARED_SECRET_B64U: coordinatorSharedSecretB64u,
  THRESHOLD_ED25519_RELAYER_COSIGNERS: relayerCosignersJson,
  THRESHOLD_ED25519_RELAYER_COSIGNER_T: '2',
};

const coordinator = run('node', ['--watch', 'dist/index.js'], {
  env: {
    ...commonEnv,
    PORT: '3000',
    THRESHOLD_NODE_ROLE: 'coordinator',
    THRESHOLD_ED25519_SHARE_MODE: 'derived',
    THRESHOLD_ED25519_MASTER_SECRET_B64U: masterSecretB64u,
    THRESHOLD_ED25519_RELAYER_COSIGNER_ID: '1',
  },
});

const cosigner2 = run('node', ['--watch', 'dist/index.js'], {
  env: {
    ...commonEnv,
    PORT: '3001',
    THRESHOLD_NODE_ROLE: 'cosigner',
    THRESHOLD_ED25519_RELAYER_COSIGNER_ID: '2',
    THRESHOLD_ED25519_SHARE_MODE: '',
    THRESHOLD_ED25519_MASTER_SECRET_B64U: '',
  },
});

const cosigner3 = run('node', ['--watch', 'dist/index.js'], {
  env: {
    ...commonEnv,
    PORT: '3002',
    THRESHOLD_NODE_ROLE: 'cosigner',
    THRESHOLD_ED25519_RELAYER_COSIGNER_ID: '3',
    THRESHOLD_ED25519_SHARE_MODE: '',
    THRESHOLD_ED25519_MASTER_SECRET_B64U: '',
  },
});

function shutdown(signal) {
  console.log(`[shutdown] received ${signal}, closing relay fleet...`);
  try { tsc.kill(); } catch {}
  try { coordinator.kill(); } catch {}
  try { cosigner2.kill(); } catch {}
  try { cosigner3.kill(); } catch {}
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
