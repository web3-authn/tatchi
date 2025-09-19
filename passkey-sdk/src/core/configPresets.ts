import { PasskeyManager } from './PasskeyManager';
import type { PasskeyManagerConfigs } from './types/passkeyManager';

type PublicEnv = Record<string, string | undefined>;

function readViteEnv(): PublicEnv { try { return (import.meta as any)?.env || {}; } catch { return {}; } }
function readProcessEnv(): PublicEnv { try { return (typeof process !== 'undefined' && (process as any)?.env) || {}; } catch { return {}; } }
function pickFirst(envs: PublicEnv[], keys: string[]): string | undefined {
  for (const env of envs) {
    for (const key of keys) {
      const v = env[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return undefined;
}

export type PresetMode = 'app-wallet' | 'iframe-wallet';

export function getModeFromEnv(): PresetMode {
  const envs = [readViteEnv(), readProcessEnv()];
  const walletOrigin = pickFirst(envs, [
    'VITE_WALLET_ORIGIN',
    'NEXT_PUBLIC_WALLET_ORIGIN',
    'REACT_APP_WALLET_ORIGIN',
    'WALLET_ORIGIN',
  ]);
  return walletOrigin ? 'iframe-wallet' as const : 'app-wallet' as const;
}

export function buildAppWalletConfigsFromEnv(overrides: Partial<PasskeyManagerConfigs> = {}): PasskeyManagerConfigs {
  const envs = [readViteEnv(), readProcessEnv()];
  const nearRpcUrl = overrides.nearRpcUrl || pickFirst(envs, [
    'VITE_NEAR_RPC_URL', 'NEXT_PUBLIC_NEAR_RPC_URL', 'REACT_APP_NEAR_RPC_URL', 'NEAR_RPC_URL'
  ]) || 'https://test.rpc.fastnear.com';

  const nearNetwork = (overrides.nearNetwork || pickFirst(envs, [
    'VITE_NEAR_NETWORK', 'NEXT_PUBLIC_NEAR_NETWORK', 'REACT_APP_NEAR_NETWORK', 'NEAR_NETWORK'
  ]) || 'testnet') as 'testnet' | 'mainnet';

  const contractId = overrides.contractId || pickFirst(envs, [
    'VITE_CONTRACT_ID', 'NEXT_PUBLIC_CONTRACT_ID', 'REACT_APP_CONTRACT_ID', 'CONTRACT_ID'
  ]) || (nearNetwork === 'mainnet' ? 'web3-authn.near' : 'web3-authn-v5.testnet');

  const nearExplorerUrl = overrides.nearExplorerUrl || pickFirst(envs, [
    'VITE_NEAR_EXPLORER', 'NEXT_PUBLIC_NEAR_EXPLORER', 'REACT_APP_NEAR_EXPLORER', 'NEAR_EXPLORER'
  ]);

  const relayerAccountId = (overrides.relayer && overrides.relayer.accountId) || pickFirst(envs, [
    'VITE_RELAYER_ACCOUNT_ID', 'NEXT_PUBLIC_RELAYER_ACCOUNT_ID', 'REACT_APP_RELAYER_ACCOUNT_ID', 'RELAYER_ACCOUNT_ID'
  ]);
  const relayerUrl = (overrides.relayer && overrides.relayer.url) || pickFirst(envs, [
    'VITE_RELAYER_URL', 'NEXT_PUBLIC_RELAYER_URL', 'REACT_APP_RELAYER_URL', 'RELAYER_URL'
  ]);
  if (!relayerAccountId || !relayerUrl) {
    throw new Error('[configPresets] Missing relayer config: set RELAYER_ACCOUNT_ID and RELAYER_URL (or VITE_/NEXT_PUBLIC_/REACT_APP_ equivalents) or pass overrides.relayer');
  }

  const walletTheme = (overrides.walletTheme || pickFirst(envs, [
    'VITE_WALLET_THEME', 'NEXT_PUBLIC_WALLET_THEME', 'REACT_APP_WALLET_THEME', 'WALLET_THEME'
  ]) || undefined) as ('dark' | 'light' | undefined);

  const cfg: PasskeyManagerConfigs = {
    nearRpcUrl,
    nearNetwork,
    contractId,
    relayer: { accountId: relayerAccountId, url: relayerUrl },
    ...(nearExplorerUrl ? { nearExplorerUrl } : {}),
    ...(walletTheme ? { walletTheme } as any : {}),
    ...(overrides.vrfWorkerConfigs ? { vrfWorkerConfigs: overrides.vrfWorkerConfigs } : {}),
    ...(overrides.authenticatorOptions ? { authenticatorOptions: overrides.authenticatorOptions } : {}),
  } as PasskeyManagerConfigs;
  return cfg;
}

export function buildIframeWalletConfigsFromEnv(overrides: Partial<PasskeyManagerConfigs> = {}): PasskeyManagerConfigs {
  const base = buildAppWalletConfigsFromEnv(overrides);
  const envs = [readViteEnv(), readProcessEnv()];
  const walletOrigin = overrides.iframeWallet?.walletOrigin || pickFirst(envs, [
    'VITE_WALLET_ORIGIN', 'NEXT_PUBLIC_WALLET_ORIGIN', 'REACT_APP_WALLET_ORIGIN', 'WALLET_ORIGIN'
  ]);
  if (!walletOrigin) throw new Error('[configPresets] walletOrigin is required for iframe-wallet mode');
  const walletServicePath = overrides.iframeWallet?.walletServicePath || pickFirst(envs, [
    'VITE_WALLET_SERVICE_PATH', 'NEXT_PUBLIC_WALLET_SERVICE_PATH', 'REACT_APP_WALLET_SERVICE_PATH', 'WALLET_SERVICE_PATH'
  ]) || '/wallet-service';

  const rpIdOverride = overrides.iframeWallet?.rpIdOverride || pickFirst(envs, [
    'VITE_RP_ID_OVERRIDE', 'NEXT_PUBLIC_RP_ID_OVERRIDE', 'REACT_APP_RP_ID_OVERRIDE', 'RP_ID_OVERRIDE'
  ]);

  return {
    ...base,
    iframeWallet: {
      ...(base.iframeWallet || {}),
      walletOrigin,
      walletServicePath,
      ...(rpIdOverride ? { rpIdOverride } as any : {}),
    },
  } as PasskeyManagerConfigs;
}

export function buildConfigsFromEnv(overrides: Partial<PasskeyManagerConfigs> = {}): PasskeyManagerConfigs {
  return getModeFromEnv() === 'iframe-wallet'
    ? buildIframeWalletConfigsFromEnv(overrides)
    : buildAppWalletConfigsFromEnv(overrides);
}

/**
 * Create a PasskeyManager using env-driven presets. If iframe mode is detected
 * (walletOrigin present), it will initialize the wallet iframe client.
 */
export async function createPasskeyManagerFromEnv(overrides: Partial<PasskeyManagerConfigs> = {}): Promise<PasskeyManager> {
  const cfg = buildConfigsFromEnv(overrides);
  const pm = new PasskeyManager(cfg);
  try { await pm.initWalletIframe?.(); } catch {}
  return pm;
}
