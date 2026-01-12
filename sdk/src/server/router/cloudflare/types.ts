// Minimal Worker runtime types (avoid adding @cloudflare/workers-types dependency here)
export interface CfEnv {
  // Optional env overrides for `/.well-known/webauthn` (ROR origins list).
  //
  // Note: Do not add an index signature here. Cloudflare env bindings can include
  // KV namespaces, Durable Objects, etc., and requiring `[key: string]: string`
  // makes real-world `Env` types not assignable.
  ROR_CONTRACT_ID?: string;
  WEBAUTHN_CONTRACT_ID?: string;
  ROR_METHOD?: string;
}

/**
 * Convenience env shape matching the `examples/relay-cloudflare-worker` configuration.
 * This is optional — you can define your own `Env` type with different binding names.
 */
export interface RelayCloudflareWorkerEnv {
  RELAYER_ACCOUNT_ID: string;
  RELAYER_PRIVATE_KEY: string;
  // Optional overrides (SDK provides defaults when omitted)
  NEAR_RPC_URL?: string;
  NETWORK_ID?: string;
  WEBAUTHN_CONTRACT_ID: string;
  ACCOUNT_INITIAL_BALANCE?: string;
  CREATE_ACCOUNT_AND_REGISTER_GAS?: string;
  ZK_EMAIL_PROVER_BASE_URL?: string;
  ZK_EMAIL_PROVER_TIMEOUT_MS?: string;
  SHAMIR_P_B64U: string;
  SHAMIR_E_S_B64U: string;
  SHAMIR_D_S_B64U: string;
  EXPECTED_ORIGIN?: string;
  EXPECTED_WALLET_ORIGIN?: string;
  ENABLE_ROTATION?: string;
  RECOVER_EMAIL_RECIPIENT?: string;

  // Optional: Threshold signing (2-party FROST).
  // The SDK enables `/threshold-ed25519/*` endpoints when `thresholdEd25519KeyStore` is configured.
  THRESHOLD_ED25519_SHARE_MODE?: string;
  THRESHOLD_ED25519_MASTER_SECRET_B64U?: string;
}

export interface CfExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void
}

export interface CfScheduledEvent {
  scheduledTime?: number;
  cron?: string
}

export interface CfEmailMessage {
  from: string;
  to: string;
  // Cloudflare uses `Headers`, but keep this flexible for userland tests.
  headers: Headers | Iterable<[string, string]> | Record<string, string>;
  raw: ReadableStream | ArrayBuffer | string;
  rawSize?: number;
  setReject(reason: string): void;
}

export type FetchHandler = (request: Request, env?: CfEnv, ctx?: CfExecutionContext) => Promise<Response>;
export type ScheduledHandler = (event: CfScheduledEvent, env?: CfEnv, ctx?: CfExecutionContext) => Promise<void>;
export type EmailHandler = (message: CfEmailMessage, env?: CfEnv, ctx?: CfExecutionContext) => Promise<void>;
