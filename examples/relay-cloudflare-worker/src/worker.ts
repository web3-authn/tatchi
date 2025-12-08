import { AuthService, SessionService, buildCorsOrigins } from '@tatchi-xyz/sdk/server';
import { createCloudflareRouter, createCloudflareCron } from '@tatchi-xyz/sdk/server/router/cloudflare';
import type { CfExecutionContext, CfScheduledEvent, CfEnv } from '@tatchi-xyz/sdk/server/router/cloudflare';
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer';
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf';
import jwt from 'jsonwebtoken';
import {
  buildForwardableEmailPayload,
  normalizeAddress,
  parseAccountIdFromEmailPayload,
} from './worker-helpers';
import { handleSignedDelegateRoute } from './delegate-route';

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
  // Recipient address for recovery emails (e.g. "recover@web3authn.org").
  RECOVER_EMAIL_RECIPIENT?: string;
}

// Singleton AuthService instance shared across fetch/email/scheduled events
let service: AuthService | null = null;

function withCorsForEnv(headers: Headers, env: Env, request?: Request): void {
  const origins = buildCorsOrigins(env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN);
  if (origins === '*') {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return;
  }
  if (Array.isArray(origins)) {
    const origin = request?.headers.get('Origin') || '';
    if (origin && origins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.append('Vary', 'Origin');
      headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }
}

function getService(env: Env): AuthService {
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

  /**
   * HTTP entrypoint
   * - Handles REST API routes (create_account_and_register_user, /recover-email, sessions, etc.)
   * - Reuses the shared AuthService + session adapter via createCloudflareRouter.
   */
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
    const url = new URL(request.url);
    if (url.pathname === '/signed-delegate') {
      return handleSignedDelegateRoute(s, request, {
        healthz: true,
        corsOrigins: [env.EXPECTED_ORIGIN, env.EXPECTED_WALLET_ORIGIN],
        session,
      });
    }

    if (url.pathname === '/recover-email-zk' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => null) as any;
        const accountId = (body?.accountId || '').trim();
        const emailBlob = body?.emailBlob;
        if (!accountId || !emailBlob || typeof emailBlob !== 'string') {
          return new Response(
            JSON.stringify({ success: false, error: 'accountId and emailBlob are required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (!s.emailRecovery) {
          return new Response(
            JSON.stringify({ success: false, error: 'email recovery service unavailable' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const result = await s.emailRecovery.requestEmailRecovery({
          accountId,
          emailBlob,
        });

        const status = result.success ? 200 : 502;
        const headers = new Headers({ 'Content-Type': 'application/json' });
        withCorsForEnv(headers, env, request);
        return new Response(JSON.stringify(result), {
          status,
          headers,
        });
      } catch (e: any) {
        const msg = e?.message || 'zk-email recovery endpoint error';
        const headers = new Headers({ 'Content-Type': 'application/json' });
        withCorsForEnv(headers, env, request);
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 500, headers }
        );
      }
    }

    return router(request, env as unknown as CfEnv, ctx);
  },

  /**
   * Cron entrypoint
   * - Used for optional Shamir key rotation and health heartbeats.
   * - Activated when ENABLE_ROTATION='1' and a cron schedule is configured.
   */
  async scheduled(event: CfScheduledEvent, env: Env, ctx: CfExecutionContext) {
    const s = getService(env);
    const cron = createCloudflareCron(s, {
      enabled: env.ENABLE_ROTATION === '1',
      rotate: env.ENABLE_ROTATION === '1'
    });
    await cron(event, env as unknown as CfEnv, ctx);
  },

  /**
   * Email entrypoint
   * - Invoked by Cloudflare Email Routing for incoming messages to RECOVER_EMAIL_RECIPIENT.
   * - Normalizes headers/raw body, parses accountId from Subject/headers,
   *   and calls AuthService.emailRecovery for encrypted DKIM/TEE-based recovery.
   */
  async email(message: any, env: Env, ctx: CfExecutionContext): Promise<void> {
    const service = getService(env);

    const payload = await buildForwardableEmailPayload(message);

    console.log('[email] from:', JSON.stringify(payload.from));
    console.log('[email] to:', JSON.stringify(payload.to));
    console.log('[email] headers:', JSON.stringify(payload.headers, null, 2));
    console.log('[email] DKIM-Signature:', payload.headers['dkim-signature']);
    console.log('[email] rawSize:', JSON.stringify(payload.rawSize));

    const to = normalizeAddress(payload.to);
    const expectedRecipientRaw = String(env.RECOVER_EMAIL_RECIPIENT || '').trim();
    const expectedRecipient = expectedRecipientRaw ? normalizeAddress(expectedRecipientRaw) : '';

    if (!expectedRecipient) {
      console.log('[email] warning: RECOVER_EMAIL_RECIPIENT is not set; accepting email for', to);
    } else if (to !== expectedRecipient) {
      console.log('[email] warning: to does not match RECOVER_EMAIL_RECIPIENT', { to, expectedRecipient });
      // Do not reject here; Cloudflare routing already scoped which messages reach this worker.
    }

    const accountId = parseAccountIdFromEmailPayload(payload);

    if (!accountId) {
      console.log('[email] rejecting: missing accountId in subject or headers');
      message.setReject('Email recovery relayer rejected email: missing accountId in subject');
      return;
    }

    const emailBlob = payload.raw;
    if (!emailBlob || typeof emailBlob !== 'string') {
      console.log('[email] rejecting: missing raw email blob');
      message.setReject('Email recovery relayer rejected email: missing raw email blob');
      return;
    }

    if (!service.emailRecovery) {
      console.log('[email] rejecting: EmailRecoveryService is not configured on this relayer');
      message.setReject('Recovery relayer rejected email: email recovery service unavailable');
      return;
    }

    console.log('[email] dispatching to EmailRecoveryService.requestEmailRecovery with body-based mode selection');

    const result = await service.emailRecovery.requestEmailRecovery({
      accountId,
      emailBlob,
    });
    console.log('[email] email recovery result', JSON.stringify(result));

    if (!result?.success) {
      console.log('[email] email recovery failed', { accountId, error: result?.error });
      message.setReject('Recovery relayer rejected email');
      return;
    }

    console.log('[email] email recovery succeeded', { accountId, tx: result.transactionHash });
  }
};
