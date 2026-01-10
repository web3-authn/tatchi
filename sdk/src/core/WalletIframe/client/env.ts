import { isString } from '@/utils/validation';

type PublicEnv = Record<string, string | undefined>;

function readViteEnv(): PublicEnv {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env || {};
    return env as PublicEnv;
  } catch {
    return {};
  }
}

function readProcessEnv(): PublicEnv {
  try {
    // Browser builds usually inline these; in Node this is process.env
    const env = (typeof process !== 'undefined' && process?.env) || {};
    return env as PublicEnv;
  } catch {
    return {};
  }
}

function pickFirst(envs: PublicEnv[], keys: string[]): string | undefined {
  for (const env of envs) {
    for (const key of keys) {
      const v = env[key];
      if (isString(v)) {
        if (v.length > 0) return v;
      }
    }
  }
  return undefined;
}

export interface WalletEnvConfig {
  walletOrigin?: string;
  walletServicePath?: string; // default '/wallet-service'
  sdkBasePath?: string;       // default '/sdk'
}

export function readWalletConfigFromEnv(): WalletEnvConfig {
  const viteEnv = readViteEnv();
  const procEnv = readProcessEnv();
  const envs = [viteEnv, procEnv];

  const walletOrigin = pickFirst(envs, [
    'VITE_WALLET_ORIGIN',
    'NEXT_PUBLIC_WALLET_ORIGIN',
    'REACT_APP_WALLET_ORIGIN',
    'WALLET_ORIGIN',
  ]);

  const walletServicePath = pickFirst(envs, [
    'VITE_WALLET_SERVICE_PATH',
    'NEXT_PUBLIC_WALLET_SERVICE_PATH',
    'REACT_APP_WALLET_SERVICE_PATH',
    'WALLET_SERVICE_PATH',
  ]) || '/wallet-service';

  const sdkBasePath = pickFirst(envs, [
    'VITE_SDK_BASE_PATH',
    'NEXT_PUBLIC_SDK_BASE_PATH',
    'REACT_APP_SDK_BASE_PATH',
    'SDK_BASE_PATH',
  ]) || '/sdk';

  return { walletOrigin, walletServicePath, sdkBasePath };
}
