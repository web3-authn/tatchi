#!/usr/bin/env node
/**
 * Smoke test: relay-server /recover-email -> local zk-email prover.
 *
 * - Skips (exit 0) if the prover is not reachable.
 * - Sends `gmail_reset_full_zk.eml` to the relay email recovery endpoint.
 *
 * Prereqs:
 * - Relay server running locally (default: http://127.0.0.1:3000)
 * - ZK prover running locally (default: http://127.0.0.1:5588)
 *
 * Env:
 * - RELAY_BASE_URL (default: http://127.0.0.1:3000)
 * - RELAY_EMAIL_PATH (default: /recover-email)
 * - ZK_EMAIL_PROVER_BASE_URL (default: http://127.0.0.1:5588)
 * - EMAIL_FILE (default: src/__tests__/unit/emails/gmail_reset_full_zk.eml)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SDK_ROOT = path.resolve(path.join(__dirname, '../../..'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithTimeout(url, { method = 'GET', headers, body, timeoutMs = 2500 } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(url, { method, headers, body, signal: controller?.signal });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch {}
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    if (id !== undefined) clearTimeout(id);
  }
}

async function main() {
  const relayBaseUrl = String(process.env.RELAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const relayEmailPath = String(process.env.RELAY_EMAIL_PATH || '/recover-email').trim() || '/recover-email';
  const relayEmailUrl = relayBaseUrl + (relayEmailPath.startsWith('/') ? relayEmailPath : `/${relayEmailPath}`);

  const proverBaseUrl = String(process.env.ZK_EMAIL_PROVER_BASE_URL || 'http://127.0.0.1:5588').replace(/\/+$/, '');
  const proverProveUrl = proverBaseUrl + '/prove-email';

  const emailFile = String(
    process.env.EMAIL_FILE ||
      path.join(SDK_ROOT, 'src/__tests__/unit/emails/gmail_reset_full_zk.eml')
  );
  const relayTimeoutMs = Number(process.env.RELAY_TIMEOUT_MS || 120_000);

  const rawEmail = await readFile(emailFile, 'utf8');

  // 1) Prover check (matches /prove-email HTTP call)
  let proverReachable = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const prove = await fetchJsonWithTimeout(proverProveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawEmail }),
        timeoutMs: 120_000,
      });

      proverReachable = true;

      if (!prove.ok) {
        console.error('[zk-email-smoke] prover error:', prove.json || prove.text);
        process.exit(1);
      }

      if (!prove.json?.proof || !Array.isArray(prove.json?.publicSignals)) {
        console.error('[zk-email-smoke] prover returned unexpected payload:', prove.json || prove.text);
        process.exit(1);
      }

      break;
    } catch {
      await sleep(250);
    }
  }

  if (!proverReachable) {
    console.log(`[zk-email-smoke] SKIP: prover not reachable at ${proverProveUrl}`);
    process.exit(0);
  }

  // 2) Send raw email to relay /recover-email
  const body = {
    from: 'sender@example.com',
    to: 'recover@web3authn.org',
    headers: {},
    raw: rawEmail,
    rawSize: rawEmail.length,
    // If the relay route supports it, this forces zk-email mode.
    // Otherwise it is ignored and the email body ("zk-email") will select the mode.
    explicitMode: 'zk-email',
  };

  const res = await fetchJsonWithTimeout(relayEmailUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: Number.isFinite(relayTimeoutMs) && relayTimeoutMs > 0 ? relayTimeoutMs : 120_000,
  });

  console.log(`[zk-email-smoke] relay status=${res.status}`);
  if (res.text) console.log(res.text);

  if (!res.ok || res.json?.success !== true) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[zk-email-smoke] error:', err?.message || err);
  process.exit(1);
});
