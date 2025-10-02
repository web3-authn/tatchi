import { AuthService } from '@web3authn/passkey/server';
import { createCloudflareRouter, createCloudflareCron, configureCloudflareShamirWasm } from '@web3authn/passkey/server/router/cloudflare';
import type { CfExecutionContext, CfScheduledEvent, CfEnv } from '@web3authn/passkey/server/router/cloudflare';
import signerWasmModule from '@web3authn/passkey/src/wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm';
import shamirWasmModule from '@web3authn/passkey/src/wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm';

export interface Env {
  RELAYER_ACCOUNT_ID: string;
  RELAYER_PRIVATE_KEY: string;
  NEAR_RPC_URL: string;
  // Network can be set via NETWORK_ID ("testnet" | "mainnet"). Defaults to "testnet".
  NETWORK_ID?: string;
  WEBAUTHN_CONTRACT_ID: string;
  ACCOUNT_INITIAL_BALANCE?: string;
  CREATE_ACCOUNT_AND_REGISTER_GAS?: string;
  SHAMIR_P_B64U: string;
  SHAMIR_E_S_B64U: string;
  SHAMIR_D_S_B64U: string;
  EXPECTED_ORIGIN?: string;
  EXPECTED_WALLET_ORIGIN?: string;
  ENABLE_ROTATION?: string; // '1' to enable cron rotation
}

let service: AuthService | null = null;
let wasmConfigured = false;

function getService(env: Env) {
  // Configure WASM modules before creating the service (only once)
  if (!wasmConfigured) {
    console.log('[Worker] Configuring Shamir WASM module override...');
    configureCloudflareShamirWasm(shamirWasmModule);
    wasmConfigured = true;
    console.log('[Worker] Shamir WASM module override configured');
  }

  if (!service) {
    service = new AuthService({
      relayerAccountId: env.RELAYER_ACCOUNT_ID,
      relayerPrivateKey: env.RELAYER_PRIVATE_KEY,
      webAuthnContractId: env.WEBAUTHN_CONTRACT_ID,
      nearRpcUrl: env.NEAR_RPC_URL,
      networkId: env.NETWORK_ID || 'testnet',
      accountInitialBalance: env.ACCOUNT_INITIAL_BALANCE || '30000000000000000000000',
      createAccountAndRegisterGas: env.CREATE_ACCOUNT_AND_REGISTER_GAS || '85000000000000',
      shamir: {
        shamir_p_b64u: env.SHAMIR_P_B64U,
        shamir_e_s_b64u: env.SHAMIR_E_S_B64U,
        shamir_d_s_b64u: env.SHAMIR_D_S_B64U,
        graceShamirKeysFile: '', // Do not use FS on Workers
      },
      signerWasm: {
        moduleOrPath: signerWasmModule,
      },
    });
  }
  return service;
}

export default {
  async fetch(request: Request, env: Env, ctx: CfExecutionContext): Promise<Response> {
    const s = getService(env);
    const corsOrigins = env.EXPECTED_ORIGIN && env.EXPECTED_WALLET_ORIGIN
      ? [env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN]
      : '*';
    const router = createCloudflareRouter(s, { healthz: true, corsOrigins });
    return router(request, env as CfEnv, ctx);
  },
  // Optional cron; defaults to inactive. Enable by setting ENABLE_ROTATION='1' in vars and adding a [triggers] crons schedule.
  async scheduled(event: CfScheduledEvent, env: Env, ctx: CfExecutionContext) {
    const s = getService(env);
    const cron = createCloudflareCron(s, {
      enabled: env.ENABLE_ROTATION === '1',
      rotate: env.ENABLE_ROTATION === '1'
    });
    await cron(event, env as CfEnv, ctx);
  }
};
