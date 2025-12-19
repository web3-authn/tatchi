#!/usr/bin/env node
/**
 * Smoke test: relay-server /recover-email -> local zk-email prover.
 *
 * - Skips (exit 0) if the prover is not reachable/healthy.
 * - Sends `gmail_reset_full_zk.eml` to the relay email recovery endpoint.
 *
 * Prereqs:
 * - Relay server running locally (default: http://127.0.0.1:3000)
 * - ZK prover running locally (default: http://127.0.0.1:5588)
 *
 * Env:
 * - RELAY_BASE_URL (default: http://127.0.0.1:3000)
 * - RELAY_EMAIL_PATH (default: /recover-email)
 * - RELAY_TIMEOUT_MS (default: 120000)
 * - ZK_EMAIL_PROVER_BASE_URL (default: http://127.0.0.1:5588)
 * - PROVER_HEALTH_TIMEOUT_MS (default: 2500)
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

function log(...args) {
  console.log('[zk-email-smoke]', ...args);
}

function nowIso() {
  return new Date().toISOString();
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
  log('start', nowIso());

  const relayBaseUrl = String(process.env.RELAY_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const relayHealthUrl = relayBaseUrl + '/healthz';
  const relayEmailPath = String(process.env.RELAY_EMAIL_PATH || '/recover-email').trim() || '/recover-email';
  const relayEmailUrlRaw = relayBaseUrl + (relayEmailPath.startsWith('/') ? relayEmailPath : `/${relayEmailPath}`);
  const relayAsync = String(process.env.RELAY_ASYNC ?? '1').trim().toLowerCase();
  const relayEmailUrl = (relayAsync === '0' || relayAsync === 'false')
    ? relayEmailUrlRaw
    : `${relayEmailUrlRaw}${relayEmailUrlRaw.includes('?') ? '&' : '?'}async=1`;

  const proverBaseUrl = String(process.env.ZK_EMAIL_PROVER_BASE_URL || 'http://127.0.0.1:5588').replace(/\/+$/, '');
  const proverHealthUrl = proverBaseUrl + '/healthz';
  const proverProveUrl = proverBaseUrl + '/prove-email';

  const emailFile = String(
    process.env.EMAIL_FILE ||
      path.join(SDK_ROOT, 'src/__tests__/unit/emails/gmail_reset_full_zk.eml')
  );
  const relayTimeoutMs = Number(process.env.RELAY_TIMEOUT_MS || 120_000);
  const proverHealthTimeoutMs = Number(process.env.PROVER_HEALTH_TIMEOUT_MS || 2500);
  const proverProveTimeoutMs = Number(process.env.PROVER_PROVE_TIMEOUT_MS || 120_000);
  const relayHealthTimeoutMs = Number(process.env.RELAY_HEALTH_TIMEOUT_MS || 2500);

  log('email file', emailFile);
  const rawEmail = await readFile(emailFile, 'utf8');

  // 1) Prover check (cheap /healthz)
  let proverReachable = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      log(`checking prover health (attempt ${attempt}/2): ${proverHealthUrl}`);
      const health = await fetchJsonWithTimeout(proverHealthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeoutMs: proverHealthTimeoutMs,
      });
      const ok = health.ok && String(health.json?.status || '').toLowerCase() === 'ok';
      if (!ok) throw new Error('unhealthy');
      proverReachable = true;
      break;
    } catch {
      await sleep(250);
    }
  }

  if (!proverReachable) {
    log(`SKIP: prover not reachable/healthy at ${proverHealthUrl}`);
    process.exit(0);
  }
  log('prover healthy');

  // 2) Hit prover /prove-email (matches docker prover API)
  log(`POST ${proverProveUrl} (timeout ${proverProveTimeoutMs}ms)`);
  const prove = await fetchJsonWithTimeout(proverProveUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawEmail }),
    timeoutMs: proverProveTimeoutMs,
  });

  if (!prove.ok) {
    console.error('[zk-email-smoke] prover error:', prove.json || prove.text);
    process.exit(1);
  }
  if (!prove.json?.proof || !Array.isArray(prove.json?.publicSignals)) {
    console.error('[zk-email-smoke] prover returned unexpected payload:', prove.json || prove.text);
    process.exit(1);
  }
  log('prover prove-email ok');

  // 3) Relay health check (avoid flakiness if relay is restarting)
  let relayHealthy = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      log(`checking relay health (attempt ${attempt}/5): ${relayHealthUrl}`);
      const health = await fetchJsonWithTimeout(relayHealthUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeoutMs: relayHealthTimeoutMs,
      });
      const ok = health.ok && health.json?.ok === true;
      if (!ok) throw new Error('unhealthy');
      relayHealthy = true;
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!relayHealthy) {
    console.error('[zk-email-smoke] relay not reachable/healthy at', relayHealthUrl);
    process.exit(1);
  }
  log('relay healthy');

  // 4) Send raw email to relay /recover-email
  const body = {
    from: 'sender@example.com',
    to: 'recover@web3authn.org',
    headers: {},
    raw: rawEmail,
    rawSize: rawEmail.length,
    explicitMode: 'zk-email',
  };

  log(`POST ${relayEmailUrl} (timeout ${relayTimeoutMs}ms)`);
  const waiting = setInterval(() => {
    log('waiting for relay response...');
  }, 5_000);
  if (typeof waiting.unref === 'function') waiting.unref();

  let res;
  try {
    res = await fetchJsonWithTimeout(relayEmailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: Number.isFinite(relayTimeoutMs) && relayTimeoutMs > 0 ? relayTimeoutMs : 120_000,
    });
  } catch (e) {
    const cause = e && typeof e === 'object' ? e.cause : undefined;
    const details = cause && typeof cause === 'object'
      ? cause.code || cause.message || JSON.stringify(cause)
      : undefined;
    console.error('[zk-email-smoke] relay fetch failed', { url: relayEmailUrl, details });
    throw e;
  }

  clearInterval(waiting);

  log(`relay status=${res.status}`);
  if (res.text) console.log(res.text);

  if (!res.ok || res.json?.success !== true) {
    process.exit(1);
  }

  log('done', nowIso());
  process.exit(0);
}

main().catch((err) => {
  const cause = err && typeof err === 'object' ? err.cause : undefined;
  if (cause && typeof cause === 'object') {
    console.error('[zk-email-smoke] error cause:', {
      code: cause.code,
      message: cause.message,
    });
  }
  console.error('[zk-email-smoke] error:', err?.message || err);
  process.exit(1);
});
