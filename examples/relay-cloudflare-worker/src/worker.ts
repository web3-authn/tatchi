import { AuthService } from '@tatchi-xyz/sdk/server';
import { createCloudflareRouter, createCloudflareCron } from '@tatchi-xyz/sdk/server/router/cloudflare';
import type { CfExecutionContext, CfScheduledEvent, CfEnv } from '@tatchi-xyz/sdk/server/router/cloudflare';
import signerWasmModule from '@tatchi-xyz/sdk/server/wasm/signer';
import shamirWasmModule from '@tatchi-xyz/sdk/server/wasm/vrf';

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
      },
    });
  }
  return service;
}

// Helper: parse comma-separated env var into a trimmed non-empty list
function parseCsvList(input?: string): string[] {
  const out = new Set<string>();
  for (const raw of (input || '').split(',')) {
    const s = raw.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      // Canonicalize: lowercase host, drop path/query/hash, normalize trailing slash
      const host = u.hostname.toLowerCase();
      const port = u.port ? `:${u.port}` : '';
      const proto = u.protocol === 'http:' || u.protocol === 'https:' ? u.protocol : 'https:';
      out.add(`${proto}//${host}${port}`);
    } catch {
      // Fallback: strip trailing slash and spaces
      const stripped = s.replace(/\/$/, '');
      if (stripped) out.add(stripped);
    }
  }
  return Array.from(out);
}

export default {
  async fetch(request: Request, env: Env, ctx: CfExecutionContext): Promise<Response> {
    const s = getService(env);
    // Build an allowlist of origins. Support comma-separated lists in each var.
    const listA = parseCsvList(env.EXPECTED_ORIGIN);
    const listB = parseCsvList(env.EXPECTED_WALLET_ORIGIN);
    const merged = [...listA, ...listB];
    const corsOrigins: string[] | '*' = merged.length > 0 ? merged : '*';
    const router = createCloudflareRouter(s, { healthz: true, corsOrigins });
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
