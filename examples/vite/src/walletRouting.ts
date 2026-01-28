export const EXTENSION_WALLET_PREF_KEY = 'w3a_use_extension_wallet';

export type WalletOriginSet = {
  all: string[];
  webWalletOrigin?: string;
  extensionWalletOrigin?: string;
};

export function parseWalletOrigins(input?: string): WalletOriginSet {
  const raw = String(input ?? '').trim();
  const all = raw
    ? (raw.includes(',')
        ? raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0)
        : [raw])
    : [];
  const extensionWalletOrigin = all.find((o) => o.startsWith('chrome-extension://'));
  const webWalletOrigin = all.find((o) => !o.startsWith('chrome-extension://'));
  return { all, webWalletOrigin, extensionWalletOrigin };
}

export function readUseExtensionWalletPreference(): boolean {
  try {
    return localStorage.getItem(EXTENSION_WALLET_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeUseExtensionWalletPreference(enabled: boolean): void {
  try {
    localStorage.setItem(EXTENSION_WALLET_PREF_KEY, enabled ? '1' : '0');
  } catch {}
}

