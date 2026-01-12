import { AuthService, createThresholdSigningService } from '@tatchi-xyz/sdk/server';
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

// Singleton AuthService instance shared across fetch/email/scheduled events.
// Singleton avoids re-initializing WASM clients, etc. on every request.
let service: AuthService | null = null;
let threshold: ReturnType<typeof createThresholdSigningService> | null = null;
let thresholdInitialized = false;

function shouldEnableThresholdEd25519(env: Env): boolean {
  // Keep the Worker example minimal: enable threshold signing only when the
  // deterministic relayer share secret is provided.
  return typeof env.THRESHOLD_ED25519_MASTER_SECRET_B64U === 'string'
    && env.THRESHOLD_ED25519_MASTER_SECRET_B64U.trim().length > 0;
}

function getAuthService(env: Env): AuthService {
  if (!service) {
    const thresholdEnabled = shouldEnableThresholdEd25519(env);
    const thresholdEd25519KeyStore = thresholdEnabled
      ? {
        THRESHOLD_ED25519_MASTER_SECRET_B64U: env.THRESHOLD_ED25519_MASTER_SECRET_B64U,
      } as const
      : undefined;

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
      thresholdEd25519KeyStore,
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

function getThresholdSigningService(env: Env): ReturnType<typeof createThresholdSigningService> | null {
  if (thresholdInitialized) return threshold;
  thresholdInitialized = true;

  if (!shouldEnableThresholdEd25519(env)) {
    threshold = null;
    return threshold;
  }

  const authService = getAuthService(env);
  const thresholdEd25519KeyStore = {
    // Force deterministic relayer share mode for this Worker example (no persistent stores required).
    THRESHOLD_ED25519_SHARE_MODE: 'derived',
    THRESHOLD_ED25519_MASTER_SECRET_B64U: env.THRESHOLD_ED25519_MASTER_SECRET_B64U,
  } as const;

  threshold = createThresholdSigningService({
    authService,
    thresholdEd25519KeyStore,
    logger: console,
    isNode: false,
  });
  return threshold;
}

export default {
  /**
   * HTTP entrypoint
   * - Handles REST API routes (create_account_and_register_user, /recover-email, sessions, etc.)
   * - Reuses the shared AuthService + session adapter via createCloudflareRouter.
   */
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const authService = getAuthService(env);
    const thresholdService = getThresholdSigningService(env);
    const router = createCloudflareRouter(authService, {
      healthz: true,
      readyz: true,
      // Pass raw env strings; router normalizes CSV/duplicates internally
      corsOrigins: [env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN],
      signedDelegate: { route: '/signed-delegate' },
      session: jwtSession,
      threshold: thresholdService,
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
