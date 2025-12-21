import type { EmailRecoveryMode } from './types';
import { normalizeForwardableEmailPayload, parseAccountIdFromSubject } from './zkEmail';

export enum EmailRecoveryModeHint {
  ZkEmail = 'zk-email',
  TeeEncrypted = 'tee-encrypted',
  OnchainPublic = 'onchain-public',
}

export function normalizeRecoveryMode(raw: string | undefined | null): EmailRecoveryMode | null {
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
  const normalized = normalizeRecoveryMode(candidate);
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
