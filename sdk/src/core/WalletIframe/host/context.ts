import { MinimalNearClient } from '../../NearClient';
import { TatchiPasskey } from '../../TatchiPasskey';
import { __setWalletIframeHostMode } from '../host-mode';
import { TatchiPasskeyIframe } from '../TatchiPasskeyIframe';
import type { TatchiConfigsInput } from '../../types/tatchi';
import type { PMSetConfigPayload } from '../shared/messages';
import { isObject, isString } from '@/utils/validation';
import { setEmbeddedBase } from '../../sdkPaths';
import { ensureTrailingSlash } from '../shared/runtime';
import { assertWalletHostConfigsNoNestedIframeWallet, sanitizeWalletHostConfigs } from './config-guards';
import type { WalletUIRegistry } from './iframe-lit-element-registry';

export interface HostContext {
  parentOrigin: string | null;
  port: MessagePort | null;
  walletConfigs: TatchiConfigsInput | null;
  nearClient: MinimalNearClient | null;
  tatchiPasskey: TatchiPasskey | TatchiPasskeyIframe | null;
  onWindowMessage?: (e: MessageEvent) => void;
  prefsUnsubscribe?: (() => void) | null;
}

export type WalletHostConfigResult = {
  configs: TatchiConfigsInput;
  embeddedAssetsBase: string;
  uiRegistry?: WalletUIRegistry;
};

export function createHostContext(): HostContext {
  return {
    parentOrigin: null,
    port: null,
    walletConfigs: null,
    nearClient: null,
    tatchiPasskey: null,
    onWindowMessage: undefined,
    prefsUnsubscribe: null,
  };
}

export function ensurePasskeyManager(ctx: HostContext): boolean {
  const { walletConfigs } = ctx;
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call PM_SET_CONFIG first.');
  }
  if (!walletConfigs.contractId) {
    throw new Error('Wallet service misconfigured: contractId is required.');
  }
  if (!ctx.nearClient) {
    ctx.nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  }
  if (!ctx.tatchiPasskey) {
    const cfg = sanitizeWalletHostConfigs(walletConfigs);
    assertWalletHostConfigsNoNestedIframeWallet(cfg);
    __setWalletIframeHostMode(true);
    ctx.tatchiPasskey = new TatchiPasskey(cfg, ctx.nearClient);
    try {
      const pmAny = ctx.tatchiPasskey as unknown as { warmCriticalResources?: () => Promise<void> };
      if (pmAny?.warmCriticalResources) void pmAny.warmCriticalResources();
    } catch {}
    updateThemeBridge(ctx);
    return true;
  }
  return false;
}

export function updateThemeBridge(ctx: HostContext): void {
  try {
    const pm = ctx.tatchiPasskey;
    if (!pm) return;
    const theme = (pm as any)?.theme as string | undefined;
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-w3a-theme', theme);
    }
  } catch {}
}

export function mergeWalletHostConfig(
  prev: TatchiConfigsInput | null,
  payload: PMSetConfigPayload,
  location: { origin: string; href: string },
): WalletHostConfigResult {
  const existing = prev || ({} as TatchiConfigsInput);
  const base = {
    nearRpcUrl: payload?.nearRpcUrl || existing.nearRpcUrl || '',
    nearNetwork: payload?.nearNetwork || existing.nearNetwork || 'testnet',
    contractId: payload?.contractId || existing.contractId || '',
    nearExplorerUrl: payload?.nearExplorerUrl || existing.nearExplorerUrl,
    signerMode: payload?.signerMode || existing.signerMode,
    relayer: payload?.relayer || existing.relayer,
    authenticatorOptions: payload?.authenticatorOptions || existing.authenticatorOptions,
    vrfWorkerConfigs: payload?.vrfWorkerConfigs || existing.vrfWorkerConfigs,
    emailRecoveryContracts: payload?.emailRecoveryContracts || existing.emailRecoveryContracts,
    iframeWallet: {
      ...(existing.iframeWallet || {}),
      rpIdOverride: payload?.rpIdOverride || existing.iframeWallet?.rpIdOverride,
    },
  } as TatchiConfigsInput;

  const configs = sanitizeWalletHostConfigs(base);

  const safeOrigin = location.origin || location.href;
  const defaultRoot = (() => {
    try {
      return ensureTrailingSlash(new URL('/sdk/', safeOrigin).toString());
    } catch {
      return '/sdk/';
    }
  })();

  let resolvedBase = defaultRoot;
  const assetsBaseUrlCandidate = isString(payload?.assetsBaseUrl) ? payload?.assetsBaseUrl : undefined;
  if (assetsBaseUrlCandidate !== undefined) {
    try {
      const u = new URL(assetsBaseUrlCandidate, safeOrigin);
      if (u.origin === safeOrigin) {
        resolvedBase = ensureTrailingSlash(u.toString());
      }
    } catch {}
  }

  const uiRegistry = isObject(payload?.uiRegistry) ? (payload?.uiRegistry as WalletUIRegistry) : undefined;

  return { configs, embeddedAssetsBase: resolvedBase, uiRegistry };
}

export function applyWalletConfig(
  ctx: HostContext,
  payload: PMSetConfigPayload,
  location?: { origin: string; href: string },
): WalletHostConfigResult {
  const origin = location?.origin ?? window.location.origin ?? '';
  const href = location?.href ?? window.location.href ?? '';
  const merged = mergeWalletHostConfig(ctx.walletConfigs, payload, { origin, href });
  ctx.walletConfigs = merged.configs;

  setEmbeddedBase(merged.embeddedAssetsBase);

  // Reset instances so they re-initialize with new config lazily
  ctx.prefsUnsubscribe?.();
  ctx.prefsUnsubscribe = null;
  ctx.nearClient = null;
  ctx.tatchiPasskey = null;

  // Forward UI registry to iframe-lit-elem-mounter if provided
  if (merged.uiRegistry) {
    try { window.postMessage({ type: 'WALLET_UI_REGISTER_TYPES', payload: merged.uiRegistry }, '*'); } catch {}
  }

  return merged;
}
