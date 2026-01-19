import { IndexedDBManager } from '../IndexedDBManager';
import type { AccountId } from '../types/accountIds';
import { DEFAULT_CONFIRMATION_CONFIG, type ConfirmationConfig } from '../types/signer-worker';
import type { UserPreferences } from '../IndexedDBManager/passkeyClientDB';

type WalletTheme = 'dark' | 'light' | undefined;

/**
 * Initialize the persisted per-user theme preference from `configs.walletTheme` when a new
 * user record is created locally (e.g., registration, email recovery, device linking).
 *
 * This prevents a post-flow "theme flip" when the SDK later hydrates preferences from IndexedDB.
 */
export async function persistInitialThemePreferenceFromWalletTheme(args: {
  nearAccountId: AccountId;
  deviceNumber: number;
  walletTheme: WalletTheme;
  hadUserRecordBefore: boolean;
  logTag: string;
}): Promise<void> {
  const { nearAccountId, deviceNumber, walletTheme, hadUserRecordBefore, logTag } = args;
  if (walletTheme !== 'dark' && walletTheme !== 'light') return;
  if (hadUserRecordBefore) return;

  try {
    const user = await IndexedDBManager.clientDB.getUserByDevice(nearAccountId, deviceNumber).catch(() => null);
    if (!user) return;

    const prefsBase: UserPreferences = (user.preferences as UserPreferences | undefined) ?? {
      useRelayer: false,
      useNetwork: 'testnet',
      confirmationConfig: DEFAULT_CONFIRMATION_CONFIG,
    };

    const confirmationBase: ConfirmationConfig = (prefsBase.confirmationConfig as ConfirmationConfig | undefined)
      ?? DEFAULT_CONFIRMATION_CONFIG;

    if (confirmationBase.theme === walletTheme) return;

    const updatedPrefs: UserPreferences = {
      ...prefsBase,
      confirmationConfig: {
        ...confirmationBase,
        theme: walletTheme,
      },
    };

    await IndexedDBManager.clientDB.updateUser(
      nearAccountId,
      { preferences: updatedPrefs },
      deviceNumber,
    );
  } catch (err) {
    console.warn(`[${logTag}] Failed to persist initial theme preference:`, err);
  }
}

