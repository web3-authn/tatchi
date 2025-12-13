import type { TatchiPasskey } from '@/core/TatchiPasskey';
import { awaitWalletIframeReady } from '../../../utils/walletIframe';

export interface RecentLoginPrefillResult {
  username: string;
}

/**
 * Best-effort: fetch the most-recently used account and return its username prefix.
 * Intended to be called from a lazily imported "feature island".
 */
export async function getRecentLoginPrefill(
  tatchiPasskey: TatchiPasskey,
): Promise<RecentLoginPrefillResult | null> {
  try {
    await awaitWalletIframeReady(tatchiPasskey).catch(() => false);
    const { lastUsedAccount } = await tatchiPasskey.getRecentLogins();
    const username = (lastUsedAccount?.nearAccountId ?? '').split('.')[0] || '';
    if (!username) return null;
    return { username };
  } catch {
    return null;
  }
}

export default getRecentLoginPrefill;
