import { PasskeyClientDBManager } from '@/core/IndexedDBManager';
import type { AccountId } from '../../types/accountIds';
import { toAccountId } from '../../types/accountIds';

/**
 * Returns the deviceNumber for the given account, preferring the last user entry
 * when it matches the account, otherwise falling back to the stored user record.
 * Defaults to 1 if not found.
 */
export async function getDeviceNumberForAccount(
  nearAccountId: AccountId | string,
  clientDB: PasskeyClientDBManager
): Promise<number> {
  let deviceNumber = 1;
  try {
    const accountId = toAccountId(nearAccountId);
    const last = await clientDB.getLastUser();
    if (last && (last.nearAccountId === accountId)) {
      deviceNumber = last.deviceNumber || 1;
    } else {
      const userData = await clientDB.getUser(accountId);
      deviceNumber = (userData?.deviceNumber ?? 1);
    }
  } catch {}
  return deviceNumber;
}
