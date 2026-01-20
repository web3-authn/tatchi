import { MinimalNearClient } from '../../NearClient';
import { TatchiPasskey } from '../../TatchiPasskey';
import { __setWalletIframeHostMode } from '../host-mode';
import { TatchiPasskeyIframe } from '../TatchiPasskeyIframe';
import type { TatchiConfigsInput } from '../../types/tatchi';
import type { PMSetConfigPayload } from '../shared/messages';
import { isString } from '@/utils/validation';
import { setEmbeddedBase } from '../../sdkPaths';
import { assertWalletHostConfigsNoNestedIframeWallet, sanitizeWalletHostConfigs } from './config-guards';

export interface HostContext {
  parentOrigin: string | null;
  port: MessagePort | null;
  walletConfigs: TatchiConfigsInput | null;
  nearClient: MinimalNearClient | null;
  tatchiPasskey: TatchiPasskey | TatchiPasskeyIframe | null;
  onWindowMessage?: (e: MessageEvent) => void;
}

export function createHostContext(): HostContext {
  return {
    parentOrigin: null,
    port: null,
    walletConfigs: null,
    nearClient: null,
    tatchiPasskey: null,
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
  }
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

export function applyWalletConfig(ctx: HostContext, payload: PMSetConfigPayload): void {
  const prev = ctx.walletConfigs || ({} as TatchiConfigsInput);
  const base = {
    nearRpcUrl: payload?.nearRpcUrl || prev.nearRpcUrl || '',
    nearNetwork: payload?.nearNetwork || prev.nearNetwork || 'testnet',
    contractId: payload?.contractId || prev.contractId || '',
    nearExplorerUrl: payload?.nearExplorerUrl || prev.nearExplorerUrl,
    signerMode: payload?.signerMode || prev.signerMode,
    relayer: payload?.relayer || prev.relayer,
    authenticatorOptions: payload?.authenticatorOptions || prev.authenticatorOptions,
    vrfWorkerConfigs: payload?.vrfWorkerConfigs || prev.vrfWorkerConfigs,
    emailRecoveryContracts: payload?.emailRecoveryContracts || prev.emailRecoveryContracts,
    iframeWallet: {
      ...(prev.iframeWallet || {}),
      rpIdOverride: payload?.rpIdOverride || prev.iframeWallet?.rpIdOverride,
    },
  } as TatchiConfigsInput;
  ctx.walletConfigs = sanitizeWalletHostConfigs(base);

  // Configure SDK embedded asset base for Lit modal/embedded components
  try {
    const assetsBaseUrl = payload?.assetsBaseUrl as string | undefined;
    const safeOrigin = window.location.origin || window.location.href;
    const defaultRoot = (() => {
      try {
        const base = new URL('/sdk/', safeOrigin).toString();
        return base.endsWith('/') ? base : base + '/';
      } catch {
        return '/sdk/';
      }
    })();
    let resolvedBase = defaultRoot;
    const assetsBaseUrlCandidate = isString(assetsBaseUrl) ? assetsBaseUrl : undefined;
    if (assetsBaseUrlCandidate !== undefined) {
      try {
        const u = new URL(assetsBaseUrlCandidate, safeOrigin);
        if (u.origin === safeOrigin) {
          const norm = u.toString().endsWith('/') ? u.toString() : u.toString() + '/';
          resolvedBase = norm;
        }
      } catch {}
    }
    setEmbeddedBase(resolvedBase);
  } catch {}

  // Reset instances so they re-initialize with new config lazily
  ctx.nearClient = null;
  ctx.tatchiPasskey = null;

  // Forward UI registry to iframe-lit-elem-mounter if provided
  try {
    const uiRegistry = payload?.uiRegistry;
    if (uiRegistry && typeof uiRegistry === 'object') {
      window.postMessage({ type: 'WALLET_UI_REGISTER_TYPES', payload: uiRegistry }, '*');
    }
  } catch {}
}
