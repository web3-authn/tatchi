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
  // Optional: base URL for forwarding email payloads back into the relay HTTP API.
  // If unset, the worker will construct a URL based on the incoming email's domain.
  RELAYER_URL?: string;
  // Recipient address for recovery emails (e.g. "reset@web3authn.org").
  RESET_EMAIL_RECIPIENT?: string;
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
      accountInitialBalance: env.ACCOUNT_INITIAL_BALANCE || '40000000000000000000000', // 0.04 NEAR
      createAccountAndRegisterGas: env.CREATE_ACCOUNT_AND_REGISTER_GAS || '85000000000000', // 85 TGas (tested)
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
  },
  async email(message: any, env: Env, ctx: CfExecutionContext): Promise<void> {
    const relayerUrl = env.RELAYER_URL || '';

    // Basic debug logging; safe for low volume.
    console.log('[email] from:', JSON.stringify(message.from));
    console.log('[email] to:', JSON.stringify(message.to));

    // Convert Headers to a standard JS object
    let headersObj: Record<string, string> = {};
    headersObj = Object.fromEntries(message.headers as any);
    console.log('[email] headers:', JSON.stringify(headersObj, null, 2));
    console.log('[email] DKIM-Signature:', message.headers.get('DKIM-Signature'));

    const rawText = await new Response(message.raw).text();
    console.log('[email] rawSize:', JSON.stringify(message.rawSize));

    const to = String(message.to || '').toLowerCase();
    const expectedRecipient = String(env.RESET_EMAIL_RECIPIENT || '').trim().toLowerCase();

    if (!expectedRecipient || to !== expectedRecipient) {
      message.setReject('Unknown address');
      return;
    }

    // Determine base URL for calling the relay's HTTP API.
    let base = relayerUrl;
    if (!base) {
      try {
        // Best-effort: derive origin from the incoming worker URL.
        // This assumes the relay HTTP endpoint is deployed under the same host.
        const sampleUrl = new URL('https://relay.tatchi.xyz'); // fallback
        base = sampleUrl.origin;
      } catch {
        base = 'https://relay.tatchi.xyz';
      }
    }
    const baseTrimmed = base.replace(/\/+$/, '');

    console.log(`[email] Forwarding ZK-email reset request to ${baseTrimmed}/reset-email`);

    // Normalize headers to lowercase keys for the payload.
    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headersObj)) {
      normalizedHeaders[String(k).toLowerCase()] = String(v);
    }

    const payload = {
      from: message.from,
      to: message.to,
      headers: normalizedHeaders,
      raw: rawText,
      rawSize: typeof message.rawSize === 'number' ? message.rawSize : undefined,
    };

    const response = await fetch(`${baseTrimmed}/reset-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      message.setReject('Recovery relayer rejected email');
      return;
    }

    // Optionally forward to a debug inbox.
    await message.forward('dev@web3authn.org');
  }
};
