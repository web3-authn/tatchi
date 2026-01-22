import { AuthService } from '@tatchi-xyz/sdk/server';
import {
  createCloudflareCron,
  createCloudflareEmailHandler,
  createCloudflareRouter,
} from '@tatchi-xyz/sdk/server/router/cloudflare';
import type {
  CfEmailMessage,
  CfScheduledEvent,
  CfExecutionContext as Ctx,
} from '@tatchi-xyz/sdk/server/router/cloudflare';
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer';
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf';
import jwtSession from './jwtSession';

export { ThresholdEd25519StoreDurableObject } from '@tatchi-xyz/sdk/server/router/cloudflare';

// Singleton AuthService instance shared across fetch/email/scheduled events.
// Singleton avoids re-initializing WASM clients, etc. on every request.
let service: AuthService | null = null;

type Env = {
  // base env vars
  RELAYER_ACCOUNT_ID: string;
  RELAYER_PRIVATE_KEY: string;
  NEAR_RPC_URL?: string;
  NETWORK_ID?: string;
  WEBAUTHN_CONTRACT_ID: string;
  ACCOUNT_INITIAL_BALANCE?: string;
  CREATE_ACCOUNT_AND_REGISTER_GAS?: string;
  EXPECTED_ORIGIN?: string;
  EXPECTED_WALLET_ORIGIN?: string;
  // Shamir config
  SHAMIR_P_B64U: string;
  SHAMIR_E_S_B64U: string;
  SHAMIR_D_S_B64U: string;
  ENABLE_ROTATION?: string;
  // Email recovery
  RECOVER_EMAIL_RECIPIENT?: string;
  // Threshold signing (optional)
  THRESHOLD_ED25519_MASTER_SECRET_B64U?: string;
  THRESHOLD_ED25519_SHARE_MODE?: string;
  THRESHOLD_PREFIX?: string;
  // Durable Object binding for threshold state
  THRESHOLD_STORE: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  };
  // ZK Email recovery (optional)
  ZK_EMAIL_PROVER_BASE_URL?: string;
  ZK_EMAIL_PROVER_TIMEOUT_MS?: string;
};

function getAuthService(env: Env): AuthService {
  if (!service) {
    service = new AuthService({
      relayerAccountId: env.RELAYER_ACCOUNT_ID,
      relayerPrivateKey: env.RELAYER_PRIVATE_KEY,
      webAuthnContractId: env.WEBAUTHN_CONTRACT_ID,
      nearRpcUrl: env.NEAR_RPC_URL,
      networkId: env.NETWORK_ID,
      accountInitialBalance: env.ACCOUNT_INITIAL_BALANCE,
      createAccountAndRegisterGas: env.CREATE_ACCOUNT_AND_REGISTER_GAS,
      signerWasm: {
        moduleOrPath: signerWasmModule, // Pass WASM module for Cloudflare Workers
      },
      thresholdEd25519KeyStore: {
        kind: 'cloudflare-do',
        namespace: env.THRESHOLD_STORE,
        name: 'threshold-ed25519-store',
        THRESHOLD_PREFIX: env.THRESHOLD_PREFIX,
        THRESHOLD_ED25519_SHARE_MODE: env.THRESHOLD_ED25519_SHARE_MODE,
        THRESHOLD_ED25519_MASTER_SECRET_B64U: env.THRESHOLD_ED25519_MASTER_SECRET_B64U,
      },
      shamir: {
        SHAMIR_P_B64U: env.SHAMIR_P_B64U,
        SHAMIR_E_S_B64U: env.SHAMIR_E_S_B64U,
        SHAMIR_D_S_B64U: env.SHAMIR_D_S_B64U,
        graceShamirKeysFile: '', // Do not use FS on Workers
        moduleOrPath: shamirWasmModule, // Pass WASM module for Cloudflare Workers
      },
      // optional
      zkEmailProver: {
        ZK_EMAIL_PROVER_BASE_URL: env.ZK_EMAIL_PROVER_BASE_URL,
        ZK_EMAIL_PROVER_TIMEOUT_MS: env.ZK_EMAIL_PROVER_TIMEOUT_MS,
      },
    });
  }
  return service;
}

export default {
  /**
   * HTTP entrypoint
   * - Handles REST API routes (create_account_and_register_user, /recover-email, sessions, etc.)
   * - Reuses the shared AuthService + session adapter via createCloudflareRouter.
   */
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const authService = getAuthService(env);
    const router = createCloudflareRouter(authService, {
      healthz: true,
      readyz: true,
      // Pass raw env strings; router normalizes CSV/duplicates internally
      corsOrigins: [env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN],
      signedDelegate: { route: '/signed-delegate' },
      session: jwtSession,
    });
    return router(request, env, ctx);
  },

  /**
   * Cron entrypoint
   * - Used for optional Shamir key rotation and health heartbeats.
   * - Activated when ENABLE_ROTATION='1' and a cron schedule is configured.
   */
  async scheduled(event: CfScheduledEvent, env: Env, ctx: Ctx) {
    const authService = getAuthService(env);
    const enabled = env.ENABLE_ROTATION === '1';
    const cron = createCloudflareCron(authService, {
      enabled,
      rotate: enabled,
    });
    await cron(event, env, ctx);
  },

  /**
   * Email entrypoint
   * - Invoked by Cloudflare Email Routing for incoming messages to RECOVER_EMAIL_RECIPIENT.
   * - Normalizes headers/raw body, parses accountId from Subject/headers,
   *   and calls AuthService.emailRecovery for encrypted DKIM/TEE-based recovery.
   */
  async email(message: CfEmailMessage, env: Env, ctx: Ctx): Promise<void> {
    const authService = getAuthService(env);
    const handler = createCloudflareEmailHandler(authService, {
      expectedRecipient: env.RECOVER_EMAIL_RECIPIENT,
      verbose: true,
      logger: console,
    });
    await handler(message, env, ctx);
  }
};
