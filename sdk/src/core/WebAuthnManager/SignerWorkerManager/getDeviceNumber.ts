import type { PasskeyClientDBManager } from '@/core/IndexedDBManager';
import { toAccountId, type AccountId } from '../../types/accountIds';

/**
 * Return the deviceNumber for the last logged-in user for the given account.
 * This uses the app-state "last user" pointer only; if it does not match the
 * requested account, an error is thrown instead of silently falling back.
 */
export async function getLastLoggedInDeviceNumber(
  nearAccountId: AccountId | string,
  clientDB: PasskeyClientDBManager
): Promise<number> {
  const accountId = toAccountId(nearAccountId);
  const last = await clientDB.getLastUser();
  if (last && last.nearAccountId === accountId && typeof last.deviceNumber === 'number') {
    return last.deviceNumber;
  }
  throw new Error(`No last user session for account ${accountId}`);
}
