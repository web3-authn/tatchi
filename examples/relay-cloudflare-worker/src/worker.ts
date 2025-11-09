import { AuthService, SessionService } from '@tatchi-xyz/sdk/server';
import { createCloudflareRouter, createCloudflareCron } from '@tatchi-xyz/sdk/server/router/cloudflare';
import type { CfExecutionContext, CfScheduledEvent, CfEnv } from '@tatchi-xyz/sdk/server/router/cloudflare';
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer';
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf';
import jwt from 'jsonwebtoken';

// Strongly-typed JWT claims used by this demo
type DemoJwtClaims = {
  sub: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  rpId?: string;
  blockHeight?: number;
};

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
  // Comma-separated lists are supported (e.g. "https://hosted.tatchi.xyz, https://tatchi.xyz")
  EXPECTED_ORIGIN?: string;
  EXPECTED_WALLET_ORIGIN?: string;
  ENABLE_ROTATION?: string; // '1' to enable cron rotation
}

let service: AuthService | null = null;

function getService(env: Env) {
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
        moduleOrPath: shamirWasmModule, // Pass WASM module for Cloudflare Workers
      },
      signerWasm: {
        moduleOrPath: signerWasmModule,
      }
    });
  }
  return service;
}

export default {
  async fetch(request: Request, env: Env, ctx: CfExecutionContext): Promise<Response> {
    const s = getService(env);
    const session = new SessionService<DemoJwtClaims>({
      jwt: {
        signToken: ({ payload }: { header: Record<string, unknown>; payload: Record<string, unknown> }) => {
          const secret = 'demo-secret';
          return jwt.sign(payload as any, secret, {
            algorithm: 'HS256',
            issuer: 'relay-worker-demo',
            audience: 'tatchi-app-demo',
            expiresIn: 24 * 60 * 60
          });
        },
        verifyToken: async (token: string): Promise<{ valid: boolean; payload?: DemoJwtClaims }> => {
          try {
            const secret = 'demo-secret';
            const payload = jwt.verify(token, secret, {
              algorithms: ['HS256'],
              issuer: 'relay-worker-demo',
              audience: 'tatchi-app-demo'
            }) as DemoJwtClaims;
            return { valid: true, payload };
          } catch {
            return { valid: false };
          }
        }
      },
      cookie: { name: 'w3a_session' }
    });
    const router = createCloudflareRouter(s, {
      healthz: true,
      // Pass raw env strings; router normalizes CSV/duplicates internally
      corsOrigins: [env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN],
      session
    });
    return router(request, env as unknown as CfEnv, ctx);
  },
  // Optional cron; defaults to inactive. Enable by setting ENABLE_ROTATION='1' in vars and adding a [triggers] crons schedule.
  async scheduled(event: CfScheduledEvent, env: Env, ctx: CfExecutionContext) {
    const s = getService(env);
    const cron = createCloudflareCron(s, {
      enabled: env.ENABLE_ROTATION === '1',
      rotate: env.ENABLE_ROTATION === '1'
    });
    await cron(event, env as unknown as CfEnv, ctx);
  }
};
