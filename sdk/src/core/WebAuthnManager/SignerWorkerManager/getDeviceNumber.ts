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

/**
 * Resolve a deviceNumber for a specific account even when the scoped "last user"
 * pointer is missing (e.g., first load under a new parentOrigin scope).
 *
 * This is best-effort and will:
 * - Prefer the scoped last-user pointer when it matches the requested account.
 * - Otherwise, select the most recently updated user record for the account.
 * - Finally, fall back to any user record for the account.
 *
 * When a deviceNumber is recovered via fallback, the function will (best-effort)
 * pin it as the scoped last user for future calls.
 */
export async function resolveDeviceNumberForAccount(
  nearAccountId: AccountId | string,
  clientDB: PasskeyClientDBManager,
  opts?: { min?: number; setLastUser?: boolean }
): Promise<number> {
  const accountId = toAccountId(nearAccountId);
  const min = opts?.min ?? 1;
  const shouldSetLastUser = opts?.setLastUser !== false;

  try {
    return await getLastLoggedInDeviceNumber(accountId, clientDB);
  } catch {}

  const candidate =
    (await clientDB.getLastDBUpdatedUser(accountId).catch(() => null)) ??
    (await clientDB.getUser(accountId).catch(() => null));
  const deviceNumber = parseDeviceNumber(candidate?.deviceNumber, { min });
  if (deviceNumber === null) {
    throw new Error(`No local user session found for account ${accountId}`);
  }

  if (shouldSetLastUser) {
    try {
      await clientDB.setLastUser(accountId, deviceNumber);
    } catch {}
  }

  return deviceNumber;
}
