import { toAccountId } from '../../../types/accountIds';
import type { SignerWorkerManagerContext } from '../index';

/**
 * Load user confirmation settings from IndexedDB
 */
export async function loadUserSettings(ctx: SignerWorkerManagerContext): Promise<void> {
  if (!ctx.currentUserAccountId) {
    console.debug('[SignerWorkerManager]: No current user set, using default settings');
    return;
  }

  try {
    const user = await ctx.clientDB.getUser(toAccountId(ctx.currentUserAccountId));
    if (user?.preferences?.confirmationConfig) {
      ctx.confirmationConfig = {
        ...ctx.confirmationConfig,
        ...user.preferences.confirmationConfig
      };
      console.debug('[SignerWorkerManager]: Loaded confirmationConfig:', ctx.confirmationConfig);
    }
  } catch (error) {
    console.warn('[SignerWorkerManager]: Failed to load user settings:', error);
  }
}

/**
 * Save current confirmation settings to IndexedDB
 */
export async function saveUserSettings(ctx: SignerWorkerManagerContext): Promise<void> {
  if (!ctx.currentUserAccountId) {
    console.debug('[SignerWorkerManager]: No current user set, skipping settings save');
    return;
  }

  try {
    await ctx.clientDB.updatePreferences(toAccountId(ctx.currentUserAccountId), {
      confirmationConfig: ctx.confirmationConfig,
    });
    console.debug('[SignerWorkerManager]: Saved user settings:', ctx.confirmationConfig);
  } catch (error) {
    console.warn('[SignerWorkerManager]: Failed to save user settings:', error);
  }
}
