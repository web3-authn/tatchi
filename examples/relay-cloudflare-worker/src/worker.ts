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
  RelayCloudflareWorkerEnv as Env,
} from '@tatchi-xyz/sdk/server/router/cloudflare';
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer';
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf';
import jwtSession from './jwtSession';

// Singleton AuthService instance shared across fetch/email/scheduled events
let service: AuthService | null = null;

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
      zkEmailProver: {
        ZK_EMAIL_PROVER_BASE_URL: env.ZK_EMAIL_PROVER_BASE_URL,
        ZK_EMAIL_PROVER_TIMEOUT_MS: env.ZK_EMAIL_PROVER_TIMEOUT_MS,
      },
      shamir: {
        SHAMIR_P_B64U: env.SHAMIR_P_B64U,
        SHAMIR_E_S_B64U: env.SHAMIR_E_S_B64U,
        SHAMIR_D_S_B64U: env.SHAMIR_D_S_B64U,
        graceShamirKeysFile: '', // Do not use FS on Workers
        moduleOrPath: shamirWasmModule, // Pass WASM module for Cloudflare Workers
      },
      signerWasm: {
        moduleOrPath: signerWasmModule, // Pass WASM module for Cloudflare Workers
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
