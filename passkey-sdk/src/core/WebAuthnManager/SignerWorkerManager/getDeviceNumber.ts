import type { SignerWorkerManagerContext } from '.';
import type { AccountId } from '../../types/accountIds';

/**
 * Returns the deviceNumber for the given account, preferring the last user entry
 * when it matches the account, otherwise falling back to the stored user record.
 * Defaults to 1 if not found.
 */
export async function getDeviceNumberForAccount(
  ctx: SignerWorkerManagerContext,
  nearAccountId: AccountId | string
): Promise<number> {
  let deviceNumber = 1;
  try {
    const last = await ctx.indexedDB.clientDB.getLastUser();
    if (last && (last.nearAccountId === (nearAccountId as any))) {
      deviceNumber = last.deviceNumber || 1;
    } else {
      const userData = await ctx.indexedDB.clientDB.getUser(nearAccountId as any);
      deviceNumber = (userData?.deviceNumber ?? 1);
    }
  } catch {}
  return deviceNumber;
}

