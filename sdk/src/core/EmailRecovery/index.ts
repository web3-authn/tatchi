import type { PasskeyManagerContext } from '../TatchiPasskey';
import type { AccountId } from '../types/accountIds';
import { toAccountId } from '../types/accountIds';
import { ActionType, type ActionArgs } from '../types/actions';
import type { ActionHooksOptions, ActionResult } from '../types/passkeyManager';
import { executeAction } from '../TatchiPasskey/actions';
import { IndexedDBManager, type RecoveryEmailRecord } from '../IndexedDBManager';

const EMAIL_RECOVERER_CODE_ACCOUNT_ID = 'w3a-email-recoverer-v1.testnet';
const ZK_EMAIL_VERIFIER_ACCOUNT_ID = 'zk-email-verifier-v1.testnet';
const EMAIL_DKIM_VERIFIER_ACCOUNT_ID = 'email-dkim-verifier-v1.testnet';

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

export async function getLocalRecoveryEmails(nearAccountId: AccountId): Promise<RecoveryEmailRecord[]> {
  return IndexedDBManager.getRecoveryEmails(nearAccountId);
}

export async function clearLocalRecoveryEmails(nearAccountId: AccountId): Promise<void> {
  await IndexedDBManager.clearRecoveryEmails(nearAccountId);
}

export async function setRecoveryEmails(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  recoveryEmails: string[];
  options?: ActionHooksOptions;
}): Promise<ActionResult> {
  const { context, nearAccountId, recoveryEmails, options } = args;
  const { nearClient } = context;
  const accountId = toAccountId(nearAccountId);

  const trimmedEmails = (recoveryEmails || []).map(e => e.trim()).filter(e => e.length > 0);
  const canonicalEmails = trimmedEmails.map(canonicalizeEmail);
  const recoveryEmailHashes = await hashRecoveryEmails(recoveryEmails, accountId);

  // Persist mapping in IndexedDB (best-effort, non-blocking)
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

  // Detect whether the per-account EmailRecoverer contract is already deployed:
  // - If code exists on this account, assume recoverer is present and just call set_recovery_emails.
  // - If no code is present, attach the global email-recoverer and call new(...) with emails.
  let hasContract = false;
  try {
    const code = await nearClient.viewCode(accountId);
    hasContract = !!code && code.byteLength > 0;
  } catch {
    hasContract = false;
  }

  const actions: ActionArgs[] = hasContract
    ? [
        {
          type: ActionType.UseGlobalContract,
          accountId: EMAIL_RECOVERER_CODE_ACCOUNT_ID,
        },
        {
          type: ActionType.FunctionCall,
          methodName: 'set_recovery_emails',
          args: {
            recovery_emails: recoveryEmailHashes,
          },
          gas: '80000000000000',
          deposit: '0',
        },
      ]
    : [
        {
          type: ActionType.UseGlobalContract,
          accountId: EMAIL_RECOVERER_CODE_ACCOUNT_ID,
        },
        {
          type: ActionType.FunctionCall,
          methodName: 'new',
          args: {
            zk_email_verifier: ZK_EMAIL_VERIFIER_ACCOUNT_ID,
            email_dkim_verifier: EMAIL_DKIM_VERIFIER_ACCOUNT_ID,
            policy: null,
            recovery_emails: recoveryEmailHashes,
          },
          gas: '80000000000000',
          deposit: '0',
        },
      ];

  return executeAction({
    context,
    nearAccountId: accountId,
    receiverId: accountId,
    actionArgs: actions,
    options,
  });
}

export async function clearRecoveryEmails(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  options?: ActionHooksOptions;
}): Promise<ActionResult> {
  const { context, nearAccountId, options } = args;
  const accountId = toAccountId(nearAccountId);

  const actions: ActionArgs[] = [
    {
      type: ActionType.FunctionCall,
      methodName: 'set_recovery_emails',
      args: {
        recovery_emails: [] as number[][],
      },
      gas: '80000000000000',
      deposit: '0',
    },
  ];

  const result = await executeAction({
    context,
    nearAccountId: accountId,
    receiverId: accountId,
    actionArgs: actions,
    options,
  });

  if (result?.success) {
    try {
      await IndexedDBManager.clearRecoveryEmails(accountId);
    } catch (error) {
      console.warn('[EmailRecovery] Failed to clear local recovery emails', error);
    }
  }

  return result;
}

