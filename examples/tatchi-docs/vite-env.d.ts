/// <reference types="vite/client" />

// Project-specific env typings for Vite
// Note: Keep keys in sync with .env files and CI/Pages envs.
interface ImportMetaEnv {
  readonly VITE_RELAYER_URL?: string;
  readonly VITE_RELAYER_ACCOUNT_ID?: string;

  readonly VITE_NEAR_NETWORK?: 'testnet' | 'mainnet';
  readonly VITE_NEAR_RPC_URL?: string;
  readonly VITE_NEAR_EXPLORER?: string;
  readonly VITE_WEBAUTHN_CONTRACT_ID?: string;

  readonly VITE_WALLET_ORIGIN?: string;
  readonly VITE_WALLET_SERVICE_PATH?: string;
  readonly VITE_SDK_BASE_PATH?: string;
  readonly VITE_RP_ID_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
