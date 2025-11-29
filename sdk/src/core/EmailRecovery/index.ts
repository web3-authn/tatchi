import type { AccountId } from '../types/accountIds';
import { toAccountId } from '../types/accountIds';
import { IndexedDBManager, type RecoveryEmailRecord } from '../IndexedDBManager';

export const EMAIL_RECOVERER_CODE_ACCOUNT_ID = 'w3a-email-recoverer-v1.testnet';
export const ZK_EMAIL_VERIFIER_ACCOUNT_ID = 'zk-email-verifier-v1.testnet';
export const EMAIL_DKIM_VERIFIER_ACCOUNT_ID = 'email-dkim-verifier-v1.testnet';

export type RecoveryEmailEntry = {
  hashHex: string;
  email: string;
};

export { type RecoveryEmailRecord };

export const canonicalizeEmail = (email: string): string => {
  let addr = email;
  const angleStart = email.indexOf('<');
  const angleEnd = email.indexOf('>');
  if (angleStart !== -1 && angleEnd > angleStart) {
    addr = email.slice(angleStart + 1, angleEnd);
  }
  return addr.trim().toLowerCase();
};

export const bytesToHex = (bytes: number[] | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return `0x${Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`;
};

async function hashRecoveryEmails(emails: string[], accountId: AccountId): Promise<number[][]> {
  const encoder = new TextEncoder();
  const salt = (accountId || '').trim().toLowerCase();
  const normalized = (emails || [])
    .map(e => e.trim())
    .filter(e => e.length > 0);

  const hashed: number[][] = [];

  for (const email of normalized) {
    try {
      const canonicalEmail = canonicalizeEmail(email);
      const input = `${canonicalEmail}|${salt}`;
      const data = encoder.encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const bytes = new Uint8Array(digest);
      hashed.push(Array.from(bytes));
    } catch {
      const bytes = encoder.encode(email.toLowerCase());
      hashed.push(Array.from(bytes));
    }
  }

  return hashed;
}

/**
 * Canonicalize and hash recovery emails for an account, and persist the mapping
 * (hashHex → canonical email) in IndexedDB on a best-effort basis.
 */
export async function prepareRecoveryEmails(nearAccountId: AccountId, recoveryEmails: string[]): Promise<{
  hashes: number[][];
  pairs: RecoveryEmailEntry[];
}> {
  const accountId = toAccountId(nearAccountId);

  const trimmedEmails = (recoveryEmails || []).map(e => e.trim()).filter(e => e.length > 0);
  const canonicalEmails = trimmedEmails.map(canonicalizeEmail);
  const recoveryEmailHashes = await hashRecoveryEmails(recoveryEmails, accountId);

  const pairs: RecoveryEmailEntry[] = recoveryEmailHashes.map((hashBytes, idx) => ({
    hashHex: bytesToHex(hashBytes),
    email: canonicalEmails[idx],
  }));

  void (async () => {
    try {
      await IndexedDBManager.upsertRecoveryEmails(accountId, pairs);
    } catch (error) {
      console.warn('[EmailRecovery] Failed to persist local recovery emails', error);
    }
  })();

  return { hashes: recoveryEmailHashes, pairs };
}

export async function getLocalRecoveryEmails(nearAccountId: AccountId): Promise<RecoveryEmailRecord[]> {
  return IndexedDBManager.getRecoveryEmails(nearAccountId);
}

export async function clearLocalRecoveryEmails(nearAccountId: AccountId): Promise<void> {
  await IndexedDBManager.clearRecoveryEmails(nearAccountId);
}
