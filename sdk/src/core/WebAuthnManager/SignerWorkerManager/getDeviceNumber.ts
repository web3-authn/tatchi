import type { PasskeyClientDBManager } from '@/core/IndexedDBManager';
import { toAccountId, type AccountId } from '../../types/accountIds';

export function parseDeviceNumber(
  value: unknown,
  options: { min?: number } = {}
): number | null {
  const deviceNumber = Number(value);
  const min = options.min ?? 1;
  if (!Number.isSafeInteger(deviceNumber) || deviceNumber < min) {
    return null;
  }
  return deviceNumber;
}

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
  if (last && last.nearAccountId === accountId) {
    const deviceNumber = parseDeviceNumber(last.deviceNumber, { min: 1 });
    if (deviceNumber !== null) {
      return deviceNumber;
    }
  }
  throw new Error(`No last user session for account ${accountId}`);
}
