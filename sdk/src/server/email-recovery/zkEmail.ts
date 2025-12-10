export interface ForwardableEmailPayload {
  from: string;
  to: string;
  headers: Record<string, string>;
  raw?: string;
  rawSize?: number;
}

export type NormalizedEmailResult =
  | { ok: true; payload: ForwardableEmailPayload }
  | { ok: false; code: string; message: string };

export interface ZkEmailProverClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface ZkEmailProverResponse {
  proof: unknown;
  publicSignals: string[];
}

export interface ZkEmailProverError extends Error {
  code: string;
  status?: number;
}

export interface GenerateZkEmailProofResult {
  proof: unknown;
  publicInputs: string[];
}

export interface ParsedZkEmailBindings {
  accountId: string;
  newPublicKey: string;
  fromEmail: string;
  timestamp: string;
}

/**
 * Build a minimal ForwardableEmailPayload from a raw RFC822 email string.
 * This is primarily used by server-side helpers that receive only a raw
 * email blob (no pre-normalized headers).
 */
export function buildForwardablePayloadFromRawEmail(raw: string): ForwardableEmailPayload {
  const safeRaw = typeof raw === 'string' ? raw : '';
  const lines = safeRaw.split(/\r?\n/);

  const getHeader = (name: string): string | undefined => {
    const line = lines.find(l => new RegExp(`^${name}:`, 'i').test(l));
    if (!line) return undefined;
    const idx = line.indexOf(':');
    const rest = idx >= 0 ? line.slice(idx + 1) : '';
    const value = rest.trim();
    return value || undefined;
  };

  const fromHeader = getHeader('from') || 'unknown@zkemail.local';
  const toHeader = getHeader('to') || 'recover@zkemail.local';

  const headers: Record<string, string> = {};
  const subjectHeader = getHeader('subject');
  const dateHeader = getHeader('date');

  if (fromHeader) headers.from = fromHeader;
  if (toHeader) headers.to = toHeader;
  if (subjectHeader) headers.subject = subjectHeader;
  if (dateHeader) headers.date = dateHeader;

  return {
    from: fromHeader,
    to: toHeader,
    headers,
    raw: safeRaw,
    rawSize: safeRaw.length,
  };
}

export function normalizeForwardableEmailPayload(input: unknown): NormalizedEmailResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'invalid_email', message: 'JSON body required' };
  }

  const body = input as Partial<ForwardableEmailPayload>;
  const { from, to, headers, raw, rawSize } = body;

  if (!from || typeof from !== 'string' || !to || typeof to !== 'string') {
    return { ok: false, code: 'invalid_email', message: 'from and to are required' };
  }

  if (!headers || typeof headers !== 'object') {
    return { ok: false, code: 'invalid_email', message: 'headers object is required' };
  }

  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    normalizedHeaders[String(k).toLowerCase()] = String(v);
  }

  return {
    ok: true,
    payload: {
      from,
      to,
      headers: normalizedHeaders,
      raw: typeof raw === 'string' ? raw : undefined,
      rawSize: typeof rawSize === 'number' ? rawSize : undefined,
    },
  };
}

/**
 * Parse NEAR accountId from the Subject line inside a raw RFC822 email.
 *
 * Expected format (case-insensitive on "Subject" and "recover"):
 *   Subject: recover-123ABC bob.testnet ed25519:<pk>
 *
 * Returns the parsed accountId (e.g. "bob.testnet") or null if not found.
 */
export function parseAccountIdFromSubject(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Accept either a full RFC822 message (with "Subject: ..." header)
  // or a bare Subject value ("recover-123ABC bob.testnet ed25519:<pk>").
  let subjectText = '';
  const lines = raw.split(/\r?\n/);
  const subjectLine = lines.find(line => /^subject:/i.test(line));
  if (subjectLine) {
    const idx = subjectLine.indexOf(':');
    const restRaw = idx >= 0 ? subjectLine.slice(idx + 1) : '';
    subjectText = restRaw.trim();
  } else {
    subjectText = raw.trim();
  }

  if (!subjectText) return null;

  // Strip common reply/forward prefixes
  subjectText = subjectText.replace(/^(re|fwd):\s*/i, '').trim();
  if (!subjectText) return null;

  // Strict format: "recover-<request_id> <accountId> [ed25519:<pk>]"
  const match = subjectText.match(
    /^recover-([A-Za-z0-9]{6})\s+([^\s]+)(?:\s+ed25519:[^\s]+)?\s*$/i
  );
  if (match?.[2]) {
    return match[2];
  }

  return null;
}

function parseSubjectBindings(
  rawSubject: string | undefined | null
): { accountId: string; newPublicKey: string; requestId: string } | null {
  if (!rawSubject || typeof rawSubject !== 'string') return null;

  const lines = rawSubject.split(/\r?\n/);
  let subjectText = '';
  const subjectLine = lines.find(line => /^subject:/i.test(line));
  if (subjectLine) {
    const idx = subjectLine.indexOf(':');
    const restRaw = idx >= 0 ? subjectLine.slice(idx + 1) : '';
    subjectText = restRaw.trim();
  } else {
    subjectText = rawSubject.trim();
  }
  if (!subjectText) return null;

  subjectText = subjectText.replace(/^(re|fwd):\s*/i, '').trim();
  if (!subjectText) return null;

  // Strict format:
  //   "recover-<request_id> <accountId> ed25519:<pk>"
  const match = subjectText.match(
    /^recover-([A-Za-z0-9]{6})\s+([^\s]+)\s+ed25519:([^\s]+)\s*$/i
  );
  if (!match) return null;

  const [, requestId, accountId, newPublicKey] = match;

  return {
    accountId,
    newPublicKey,
    requestId,
  };
}

export function extractZkEmailBindingsFromPayload(
  payload: ForwardableEmailPayload
): ParsedZkEmailBindings | null {
  const raw = payload.raw || '';
  const lines = raw.split(/\r?\n/);

  const subjectLine = lines.find(line => /^subject:/i.test(line));
  const subjectBindings = parseSubjectBindings(subjectLine ?? '');
  if (!subjectBindings) {
    return null;
  }

  const headers = payload.headers || {};
  let fromEmailRaw: string | undefined =
    (headers['from'] as any) ||
    (headers['x-from-email'] as any);
  let dateRaw: string | undefined =
    (headers['date'] as any) ||
    (headers['x-original-date'] as any);

  // Fallback: if headers object does not contain from/date,
  // attempt to parse them from the raw RFC822 email lines.
  if (!fromEmailRaw || !dateRaw) {
    for (const line of lines) {
      if (!fromEmailRaw && /^from:/i.test(line)) {
        const idx = line.indexOf(':');
        fromEmailRaw = idx >= 0 ? line.slice(idx + 1).trim() : '';
      }
      if (!dateRaw && /^date:/i.test(line)) {
        const idx = line.indexOf(':');
        dateRaw = idx >= 0 ? line.slice(idx + 1).trim() : '';
      }
      if (fromEmailRaw && dateRaw) break;
    }
  }

  const fromEmail = String(fromEmailRaw || '').trim();
  const timestamp = String(dateRaw || '').trim();

  if (!fromEmail || !timestamp) {
    return null;
  }

  return {
    accountId: subjectBindings.accountId,
    newPublicKey: subjectBindings.newPublicKey,
    fromEmail,
    timestamp,
    // requestId is currently only used for logging/debugging.
    // It can be plumbed through to the contract in a follow-up change.
  };
}

async function postJsonWithTimeout<TResponse>(
  url: string,
  body: unknown,
  timeoutMs: number
): Promise<TResponse> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller?.signal,
    } as RequestInit);

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }

    if (!res.ok) {
      const err: ZkEmailProverError = Object.assign(
        new Error(
          json?.error ||
            `zk-email prover request failed with status ${res.status}`
        ),
        {
          code: 'prover_http_error',
          status: res.status,
        }
      );
      throw err;
    }

    return json as TResponse;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err: ZkEmailProverError = Object.assign(
        new Error('zk-email prover request timed out'),
        { code: 'prover_timeout' }
      );
      throw err;
    }
    if (e?.code) {
      throw e;
    }
    const err: ZkEmailProverError = Object.assign(
      new Error(e?.message || 'zk-email prover request failed'),
      { code: 'prover_network_error' }
    );
    throw err;
  } finally {
    if (id !== undefined) clearTimeout(id);
  }
}

export async function generateZkEmailProofFromPayload(
  payload: ForwardableEmailPayload,
  opts: ZkEmailProverClientOptions
): Promise<GenerateZkEmailProofResult> {
  if (!payload.raw || typeof payload.raw !== 'string') {
    const err: ZkEmailProverError = Object.assign(
      new Error('raw email contents are required to generate a zk-email proof'),
      { code: 'missing_raw_email' }
    );
    throw err;
  }

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const url = opts.baseUrl.replace(/\/+$/, '') + '/prove-email';

  const res = await postJsonWithTimeout<ZkEmailProverResponse>(
    url,
    { rawEmail: payload.raw },
    timeoutMs
  );

  return {
    proof: res.proof,
    publicInputs: res.publicSignals,
  };
}
