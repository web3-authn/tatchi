import { MinimalNearClient } from '../../NearClient';
import { PasskeyManager } from '../../PasskeyManager';
import { PasskeyManagerIframe } from '../PasskeyManagerIframe';
import type { PasskeyManagerConfigs } from '../../types/passkeyManager';
import type { PMSetConfigPayload } from '../shared/messages';
import { isString } from '../validation';
import { setEmbeddedBase } from '../../sdkPaths';

export interface HostContext {
  parentOrigin: string | null;
  port: MessagePort | null;
  walletConfigs: PasskeyManagerConfigs | null;
  nearClient: MinimalNearClient | null;
  passkeyManager: PasskeyManager | PasskeyManagerIframe | null;
  themeUnsubscribe?: () => void;
  onWindowMessage?: (e: MessageEvent) => void;
}

export function createHostContext(): HostContext {
  return {
    parentOrigin: null,
    port: null,
    walletConfigs: null,
    nearClient: null,
    passkeyManager: null,
    themeUnsubscribe: undefined,
    onWindowMessage: undefined,
  };
}

export function ensurePasskeyManager(ctx: HostContext): void {
  const { walletConfigs } = ctx;
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call PM_SET_CONFIG first.');
  }
  if (!walletConfigs.contractId) {
    throw new Error('Wallet service misconfigured: contractId is required.');
  }
  if (!ctx.nearClient) ctx.nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  if (!ctx.passkeyManager) {
    const cfg = {
      ...walletConfigs,
      iframeWallet: {
        ...(walletConfigs?.iframeWallet || {}),
        walletOrigin: undefined,
        walletServicePath: undefined,
        rpIdOverride: walletConfigs?.iframeWallet?.rpIdOverride,
        isWalletIframeHost: true,
      },
    } as PasskeyManagerConfigs;
    ctx.passkeyManager = new PasskeyManager(cfg, ctx.nearClient);
    try {
      const pmAny = ctx.passkeyManager as unknown as { warmCriticalResources?: () => Promise<void> };
      if (pmAny?.warmCriticalResources) void pmAny.warmCriticalResources();
    } catch {}
    updateThemeBridge(ctx);
  }
}

export function updateThemeBridge(ctx: HostContext): void {
  try {
    const pm: unknown = ctx.passkeyManager;
    if (!pm) return;
    const up = (pm as PasskeyManager).userPreferences as unknown as {
      getUserTheme(): 'dark' | 'light';
      onThemeChange(cb: (t: 'dark' | 'light') => void): () => void;
    };
    // Set initial theme attribute
    document.documentElement.setAttribute('data-w3a-theme', up.getUserTheme());
    // Deduplicate subscription on reconfigurations
    ctx.themeUnsubscribe?.();
    ctx.themeUnsubscribe = up.onThemeChange((t) => {
      try { document.documentElement.setAttribute('data-w3a-theme', t); } catch {}
    });
  } catch {}
}

export function applyWalletConfig(ctx: HostContext, payload: PMSetConfigPayload): void {
  const prev = ctx.walletConfigs || ({} as PasskeyManagerConfigs);
  ctx.walletConfigs = {
    nearRpcUrl: payload?.nearRpcUrl || prev.nearRpcUrl || '',
    nearNetwork: payload?.nearNetwork || prev.nearNetwork || 'testnet',
    contractId: (payload as any)?.contractId || prev.contractId || '',
    nearExplorerUrl: prev.nearExplorerUrl,
    relayer: payload?.relayer || prev.relayer,
    authenticatorOptions: payload?.authenticatorOptions || prev.authenticatorOptions,
    vrfWorkerConfigs: payload?.vrfWorkerConfigs || prev.vrfWorkerConfigs,
    walletTheme: payload?.theme || prev.walletTheme,
    iframeWallet: {
      ...(prev.iframeWallet || {}),
      walletOrigin: undefined,
      walletServicePath: undefined,
      rpIdOverride: payload?.rpIdOverride || prev.iframeWallet?.rpIdOverride,
    },
  } as PasskeyManagerConfigs;

  // Configure SDK embedded asset base for Lit modal/embedded components
  try {
    const assetsBaseUrl = payload?.assetsBaseUrl as string | undefined;
    const defaultRoot = (() => {
      try {
        const base = new URL('/sdk/', window.location.origin).toString();
        return base.endsWith('/') ? base : base + '/';
      } catch {
        return '/sdk/';
      }
    })();
    let resolvedBase = defaultRoot;
    if (isString(assetsBaseUrl)) {
      try {
        const u = new URL(assetsBaseUrl, window.location.origin);
        if (u.origin === window.location.origin) {
          const norm = u.toString().endsWith('/') ? u.toString() : u.toString() + '/';
          resolvedBase = norm;
        }
      } catch {}
    }
    setEmbeddedBase(resolvedBase);
  } catch {}

  // Reset instances so they re-initialize with new config lazily
  ctx.nearClient = null;
  ctx.passkeyManager = null;

  // Forward UI registry to iframe-lit-elem-mounter if provided
  try {
    const uiRegistry = (payload as any)?.uiRegistry;
    if (uiRegistry && typeof uiRegistry === 'object') {
      window.postMessage({ type: 'WALLET_UI_REGISTER_TYPES', payload: uiRegistry }, '*');
    }
  } catch {}
}

