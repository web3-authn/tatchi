import type { EmailRecoveryMode } from './types';

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
