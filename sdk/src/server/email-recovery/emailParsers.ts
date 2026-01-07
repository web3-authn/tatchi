import type { EmailRecoveryMode } from './types';
import { normalizeForwardableEmailPayload, parseAccountIdFromSubject } from './zkEmail';
import { ensureEd25519Prefix } from '../../core/nearCrypto';

export enum EmailRecoveryModeHint {
  ZkEmail = 'zk-email',
  TeeEncrypted = 'tee-encrypted',
  OnchainPublic = 'onchain-public',
}

export function parseRecoveryMode(raw: string | undefined | null): EmailRecoveryMode | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === EmailRecoveryModeHint.ZkEmail) return 'zk-email';
  if (value === EmailRecoveryModeHint.TeeEncrypted) return 'tee-encrypted';
  if (value === EmailRecoveryModeHint.OnchainPublic) return 'onchain-public';
  return null;
}

export function extractRecoveryModeFromBody(emailBlob?: string): EmailRecoveryMode | null {
  if (!emailBlob) return null;

  const lines = emailBlob.split(/\r?\n/);
  const bodyStartIndex = lines.findIndex(line => line.trim() === '');
  if (bodyStartIndex === -1) return null;

  const bodyLines = lines.slice(bodyStartIndex + 1);
  const firstNonEmptyBodyLine = bodyLines.find(line => line.trim() !== '');
  if (!firstNonEmptyBodyLine) return null;

  const candidate = firstNonEmptyBodyLine.trim();
  const normalized = parseRecoveryMode(candidate);
  if (normalized) return normalized;

  const lower = candidate.toLowerCase();
  if (lower.includes(EmailRecoveryModeHint.ZkEmail)) return 'zk-email';
  if (lower.includes(EmailRecoveryModeHint.TeeEncrypted)) return 'tee-encrypted';
  if (lower.includes(EmailRecoveryModeHint.OnchainPublic)) return 'onchain-public';

  return null;
}

type HeaderValue = string | string[] | undefined;
type HeadersLike = Headers | Record<string, HeaderValue> | undefined;

export type RecoverEmailParseResult =
  | { ok: true; accountId: string; emailBlob: string; explicitMode?: string }
  | { ok: false; status: number; code: string; message: string };

function getHeader(headers: HeadersLike, name: string): string | undefined {
  if (!headers) return undefined;

  const maybeHeaders = headers as any;
  if (typeof maybeHeaders.get === 'function') {
    const v = maybeHeaders.get(name);
    return (typeof v === 'string') ? v : undefined;
  }

  const record = headers as Record<string, HeaderValue>;
  const v = record[name.toLowerCase()] ?? record[name];
  if (Array.isArray(v)) return (typeof v[0] === 'string') ? v[0] : undefined;
  return (typeof v === 'string') ? v : undefined;
}

function parseExplicitMode(body: unknown, headers?: HeadersLike): string | undefined {
  const modeFromBody =
    (typeof (body as any)?.explicitMode === 'string' ? String((body as any).explicitMode) : '') ||
    (typeof (body as any)?.explicit_mode === 'string' ? String((body as any).explicit_mode) : '');
  const modeFromHeader = getHeader(headers, 'x-email-recovery-mode') || getHeader(headers, 'x-recovery-mode') || '';
  const raw = (modeFromBody || modeFromHeader).trim();
  return raw ? raw : undefined;
}

export function parseRecoverEmailRequest(body: unknown, opts: { headers?: HeadersLike } = {}): RecoverEmailParseResult {
  const explicitMode = parseExplicitMode(body, opts.headers);

  const normalized = normalizeForwardableEmailPayload(body);
  if (!normalized.ok) {
    return { ok: false, status: 400, code: normalized.code, message: normalized.message };
  }

  const payload = normalized.payload;
  const emailBlob = payload.raw || '';
  const emailHeaders = payload.headers || {};

  const subjectHeader = emailHeaders['subject'];
  const parsedAccountId = parseAccountIdFromSubject(subjectHeader || emailBlob);
  const headerAccountId = String(emailHeaders['x-near-account-id'] || emailHeaders['x-account-id'] || '').trim();
  const accountId = (parsedAccountId || headerAccountId || '').trim();

  if (!accountId) {
    return { ok: false, status: 400, code: 'missing_account', message: 'x-near-account-id header is required' };
  }
  if (!emailBlob) {
    return { ok: false, status: 400, code: 'missing_email', message: 'raw email blob is required' };
  }

  return { ok: true, accountId, emailBlob, explicitMode };
}

const EMAIL_ADDRESS_REGEX =
  /([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)/;

export function canonicalizeEmail(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  // Handle cases where a full header line is passed in (e.g. "From: ...").
  const withoutHeaderName = raw.replace(/^[a-z0-9-]+\s*:\s*/i, '').trim();

  // Prefer the common "Name <email@domain>" format when present, but still
  // validate/extract the actual address via regex.
  const angleMatch = withoutHeaderName.match(/<([^>]+)>/);
  const candidates = [
    angleMatch?.[1],
    withoutHeaderName,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  for (const candidate of candidates) {
    const cleaned = candidate.replace(/^mailto:\s*/i, '');
    const match = cleaned.match(EMAIL_ADDRESS_REGEX);
    if (match?.[1]) {
      return match[1].trim().toLowerCase();
    }
  }

  return withoutHeaderName.toLowerCase();
}

export function parseHeaderValue(rawEmail: string, name: string): string | undefined {
  try {
    const raw = String(rawEmail || '');
    if (!raw) return undefined;

    const lines = raw.split(/\r?\n/);
    const headerLines: string[] = [];

    // Only consider the header section (until the first blank line).
    for (const line of lines) {
      if (line.trim() === '') break;

      // RFC822 header folding: lines starting with whitespace continue previous header.
      if (/^\s/.test(line) && headerLines.length > 0) {
        headerLines[headerLines.length - 1] += ` ${line.trim()}`;
        continue;
      }

      headerLines.push(line);
    }

    const headerName = name.trim();
    if (!headerName) return undefined;

    const re = new RegExp(`^${headerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'i');
    const found = headerLines.find((l) => re.test(l));
    if (!found) return undefined;

    const idx = found.indexOf(':');
    const value = idx >= 0 ? found.slice(idx + 1).trim() : '';
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function parseRecoverSubjectBindings(
  rawEmail: string
): { requestId: string; accountId: string; newPublicKey: string } | null {
  // Accept either a full RFC822 email or a bare Subject value.
  let subjectText = (parseHeaderValue(rawEmail, 'subject') || String(rawEmail || '')).trim();
  if (!subjectText) return null;

  // Strip common reply/forward prefixes.
  subjectText = subjectText.replace(/^(re|fwd):\s*/i, '').trim();
  if (!subjectText) return null;

  // Strict format:
  //   "recover-<request_id> <accountId> ed25519:<pk>"
  const match = subjectText.match(
    /^recover-([A-Za-z0-9]{6})\s+([^\s]+)\s+ed25519:([^\s]+)\s*$/i
  );
  if (!match) return null;

  const [, requestId, accountId, newPublicKey] = match;
  return { requestId, accountId, newPublicKey: ensureEd25519Prefix(newPublicKey) };
}
