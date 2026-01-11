import { ActionType, type ActionArgsWasm, validateActionArgsWasm } from '../../core/types/actions';
import { MinimalNearClient, SignedTransaction, type AccessKeyList } from '../../core/NearClient';
import type { FinalExecutionOutcome } from '@near-js/types';
import { toPublicKeyStringFromSecretKey } from './nearKeys';
import { createAuthServiceConfig } from './config';
import { formatGasToTGas, formatYoctoToNear } from './utils';
import { parseContractExecutionError } from './errors';
import { toOptionalTrimmedString } from '../../utils/validation';
import { coerceThresholdEd25519ShareMode, coerceThresholdNodeRole } from './ThresholdService/config';
import initSignerWasm, {
  handle_signer_message,
  WorkerRequestType,
  WorkerResponseType,
  type InitInput,
  type WasmTransaction,
  type WasmSignature,
} from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';

import type {
  AuthServiceConfig,
  AuthServiceConfigInput,
  AccountCreationRequest,
  AccountCreationResult,
  CreateAccountAndRegisterRequest,
  CreateAccountAndRegisterResult,
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse,
  SignerWasmModuleSupplier,
} from './types';

import { DEFAULT_EMAIL_RECOVERY_CONTRACTS } from '../../core/defaultConfigs';
import { EmailRecoveryService } from '../email-recovery';
import { ShamirService } from './ShamirService';
import { SignedDelegate } from '../../core/types/delegate';
import {
  type ExecuteSignedDelegateResult,
  executeSignedDelegateWithRelayer,
  type DelegateActionPolicy,
} from '../delegateAction';
import { coerceLogger, type NormalizedLogger } from './logger';

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// =============================
// WASM URL CONSTANTS + HELPERS
// =============================

// Primary location (preserveModules output)
const SIGNER_WASM_MAIN_PATH = '../../wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm';
// Fallback location (dist/workers copy step)
const SIGNER_WASM_FALLBACK_PATH = '../../../workers/wasm_signer_worker_bg.wasm';

function getSignerWasmUrls(logger: NormalizedLogger): URL[] {
  const paths = [SIGNER_WASM_MAIN_PATH, SIGNER_WASM_FALLBACK_PATH];
  const resolved: URL[] = [];
  const baseUrl = import.meta.url;

  for (const path of paths) {
    try {
      if (!baseUrl) throw new Error('import.meta.url is undefined');
      resolved.push(new URL(path, baseUrl));
    } catch (err) {
      logger.warn(`Failed to resolve signer WASM relative URL for path "${path}":`, err);
    }
  }

  if (!resolved.length) {
    throw new Error('Unable to resolve signer WASM location from import.meta.url. Provide AuthServiceConfig.signerWasm.moduleOrPath in this runtime.');
  }

  return resolved;
}

function summarizeThresholdEd25519Config(cfg: AuthServiceConfig['thresholdEd25519KeyStore']): string {
  if (!cfg) return 'thresholdEd25519: not configured';

  const nodeRole = coerceThresholdNodeRole(cfg.THRESHOLD_NODE_ROLE);
  const shareMode = coerceThresholdEd25519ShareMode(cfg.THRESHOLD_ED25519_SHARE_MODE);

  const masterSecretSet = (() => {
    if ('kind' in cfg) return false;
    return Boolean(toOptionalTrimmedString(cfg.THRESHOLD_ED25519_MASTER_SECRET_B64U));
  })();

  const store = (() => {
    if ('kind' in cfg) {
      if (cfg.kind === 'upstash-redis-rest') return 'upstash';
      if (cfg.kind === 'redis-tcp') return 'redis';
      return 'in-memory';
    }
    const upstashUrl = toOptionalTrimmedString(cfg.UPSTASH_REDIS_REST_URL);
    const upstashToken = toOptionalTrimmedString(cfg.UPSTASH_REDIS_REST_TOKEN);
    const redisUrl = toOptionalTrimmedString(cfg.REDIS_URL);
    return (upstashUrl || upstashToken) ? 'upstash' : (redisUrl ? 'redis' : 'in-memory');
  })();

  const parts = [`thresholdEd25519: configured`, `nodeRole=${nodeRole}`, `shareMode=${shareMode}`, `store=${store}`];
  if (masterSecretSet) parts.push('masterSecret=set');
  return parts.join(' ');
}

/**
 * Framework-agnostic NEAR account service
 * Core business logic for account creation and registration operations
 */
export class AuthService {
  private config: AuthServiceConfig;
  private isInitialized = false;
  private nearClient: MinimalNearClient;
  private relayerPublicKey: string = '';
  private signerWasmReady = false;
  private readonly logger: NormalizedLogger;

  // Transaction queue to prevent nonce conflicts
  private transactionQueue: Promise<any> = Promise.resolve();
  private queueStats = { pending: 0, completed: 0, failed: 0 };

  // Shamir 3-pass key management (delegated to ShamirService)
  public readonly shamirService: ShamirService | null = null;
  // DKIM/TEE email recovery logic (delegated to EmailRecoveryService)
  public readonly emailRecovery: EmailRecoveryService | null = null;

  constructor(config: AuthServiceConfigInput) {
    this.config = createAuthServiceConfig(config);
    this.logger = coerceLogger(this.config.logger);
    const graceFileCandidate = (this.config.shamir?.graceShamirKeysFile || '').trim();
    this.shamirService = new ShamirService(this.config.shamir, graceFileCandidate || 'grace-keys.json');
    this.nearClient = new MinimalNearClient(this.config.nearRpcUrl);
    this.emailRecovery = new EmailRecoveryService({
      relayerAccountId: this.config.relayerAccountId,
      relayerPrivateKey: this.config.relayerPrivateKey,
      networkId: this.config.networkId,
      emailDkimVerifierContract: DEFAULT_EMAIL_RECOVERY_CONTRACTS.emailDkimVerifierContract,
      nearClient: this.nearClient,
      logger: this.config.logger,
      ensureSignerAndRelayerAccount: () => this._ensureSignerAndRelayerAccount(),
      queueTransaction: <T>(fn: () => Promise<T>, label: string) => this.queueTransaction(fn, label),
      fetchTxContext: (accountId: string, publicKey: string) => this.fetchTxContext(accountId, publicKey),
      signWithPrivateKey: (input) => this.signWithPrivateKey(input),
      getRelayerPublicKey: () => this.relayerPublicKey,
      zkEmailProver: this.config.zkEmailProver,
    });

    // Log effective configuration at construction time so operators can
    // verify wiring immediately when the service is created.
    this.logger.info(`
    AuthService initialized with:
    • networkId: ${this.config.networkId}
    • nearRpcUrl: ${this.config.nearRpcUrl}
    • relayerAccountId: ${this.config.relayerAccountId}
    • webAuthnContractId: ${this.config.webAuthnContractId}
    • accountInitialBalance: ${this.config.accountInitialBalance} (${formatYoctoToNear(this.config.accountInitialBalance)} NEAR)
    • createAccountAndRegisterGas: ${this.config.createAccountAndRegisterGas} (${formatGasToTGas(this.config.createAccountAndRegisterGas)})
    ${
      this.config.shamir
        ? `• shamir_p_b64u: ${this.config.shamir.shamir_p_b64u.slice(0, 10)}...\n    • shamir_e_s_b64u: ${this.config.shamir.shamir_e_s_b64u.slice(0, 10)}...\n    • shamir_d_s_b64u: ${this.config.shamir.shamir_d_s_b64u.slice(0, 10)}...`
        : '• shamir: not configured'
    }
    • ${summarizeThresholdEd25519Config(this.config.thresholdEd25519KeyStore)}
    ${
      this.config.zkEmailProver?.baseUrl
        ? `• zkEmailProver: ${this.config.zkEmailProver.baseUrl}`
        : `• zkEmailProver: not configured`
    }
    `);
  }

  async getRelayerAccount(): Promise<{ accountId: string; publicKey: string }> {
    await this._ensureSignerAndRelayerAccount();
    return {
      accountId: this.config.relayerAccountId,
      publicKey: this.relayerPublicKey
    };
  }

  async viewAccessKeyList(accountId: string): Promise<AccessKeyList> {
    await this._ensureSignerAndRelayerAccount();
    return this.nearClient.viewAccessKeyList(accountId);
  }

  getWebAuthnContractId(): string {
    return this.config.webAuthnContractId;
  }

  async txStatus(txHash: string, senderAccountId: string): Promise<FinalExecutionOutcome> {
    await this._ensureSignerAndRelayerAccount();
    return this.nearClient.txStatus(txHash, senderAccountId);
  }

  /**
   * Configure Shamir WASM module override for serverless environments
   * Required for Cloudflare Workers where import.meta.url doesn't work
   */
  private async configureShamirWasmForServerless(): Promise<void> {
    if (!this.config.shamir?.moduleOrPath) {
      return;
    }

    const { setShamirWasmModuleOverride } = await import('./shamirWorker.js');
    setShamirWasmModuleOverride(this.config.shamir.moduleOrPath);
  }

  private async _ensureSignerAndRelayerAccount(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize Shamir 3-pass via ShamirService (if configured)
    if (this.config.shamir && this.shamirService) {
      await this.configureShamirWasmForServerless();
      await this.shamirService.ensureReady();
    }

    // Derive public key from configured relayer private key
    try {
      this.relayerPublicKey = toPublicKeyStringFromSecretKey(this.config.relayerPrivateKey);
    } catch (e) {
      this.logger.warn('Failed to derive public key from relayerPrivateKey; ensure it is in ed25519:<base58> format');
      this.relayerPublicKey = '';
    }

    // Prepare signer WASM for transaction building/signing
    await this.ensureSignerWasm();
    this.isInitialized = true;
  }

  private async ensureSignerWasm(): Promise<void> {
    if (this.signerWasmReady) return;
    const override = this.config.signerWasm?.moduleOrPath;
    if (override) {
      try {
        const moduleOrPath = await this.resolveSignerWasmOverride(override);
        await initSignerWasm({ module_or_path: moduleOrPath as InitInput });
        this.signerWasmReady = true;
        return;
      } catch (e) {
        this.logger.error('Failed to initialize signer WASM via provided override:', e);
        throw e;
      }
    }

    let candidates: URL[];
    try {
      candidates = getSignerWasmUrls(this.logger);
    } catch (err) {
      this.logger.error('Failed to resolve signer WASM URLs:', err);
      throw err;
    }

    try {
      if (this.isNodeEnvironment()) {
        await this.initSignerWasmForNode(candidates);
        this.signerWasmReady = true;
        return;
      }

      let lastError: unknown = null;
      for (const candidate of candidates) {
        try {
          await initSignerWasm({ module_or_path: candidate as InitInput });
          this.signerWasmReady = true;
          return;
        } catch (err) {
          lastError = err;
          this.logger.warn(`Failed to initialize signer WASM from ${candidate.toString()}, trying next candidate...`);
        }
      }

      throw lastError ?? new Error('Unable to initialize signer WASM from any candidate URL');
    } catch (e) {
      this.logger.error('Failed to initialize signer WASM:', e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  private isNodeEnvironment(): boolean {
    // Detect true Node.js, not Cloudflare Workers with nodejs_compat polyfills.
    const processObj = (globalThis as unknown as { process?: { versions?: { node?: string } } }).process;
    const isNode = Boolean(processObj?.versions?.node);
    // Cloudflare Workers expose WebSocketPair and may polyfill process.
    const webSocketPair = (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair;
    const nav = (globalThis as unknown as { navigator?: { userAgent?: unknown } }).navigator;
    const isCloudflareWorker = typeof webSocketPair !== 'undefined'
      || (typeof nav?.userAgent === 'string' && nav.userAgent.includes('Cloudflare-Workers'));
    return isNode && !isCloudflareWorker;
  }

  private async resolveSignerWasmOverride(override: SignerWasmModuleSupplier): Promise<InitInput> {
    const candidate = typeof override === 'function'
      ? await (override as () => InitInput | Promise<InitInput>)()
      : await override;

    if (!candidate) {
      throw new Error('Signer WASM override resolved to an empty value');
    }

    return candidate;
  }

  /**
   * Initialize signer WASM in Node by loading the wasm file from disk.
   * Tries multiple candidate locations and falls back to path-based init if needed.
   */
  private async initSignerWasmForNode(candidates: URL[]): Promise<void> {
    const { fileURLToPath } = await import('node:url');
    const { readFile } = await import('node:fs/promises');

    // 1) Try reading and compiling bytes
    for (const url of candidates) {
      try {
        const filePath = fileURLToPath(url);
        const bytes = await readFile(filePath);
        // Ensure we pass an ArrayBuffer (not Buffer / SharedArrayBuffer) for WebAssembly.compile
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        const module = await WebAssembly.compile(ab);
        await initSignerWasm({ module_or_path: module });
        return;
      } catch {} // throw at end of function
    }

    // 2) Fallback: pass file path directly (supported in some environments)
    for (const url of candidates) {
      try {
        const filePath = fileURLToPath(url);
        await initSignerWasm({ module_or_path: filePath as unknown as InitInput });
        return;
      } catch {} // throw at end of function
    }

    throw new Error('[AuthService] Failed to initialize signer WASM from filesystem candidates');
  }

  /**
   * ===== Registration & authentication =====
   *
   * Helpers for creating accounts, registering WebAuthn credentials,
   * and verifying authentication responses.
   */

  /**
   * Create a new account with the specified balance
   */
  async createAccount(request: AccountCreationRequest): Promise<AccountCreationResult> {
    await this._ensureSignerAndRelayerAccount();

    return this.queueTransaction(async () => {
      try {
        if (!this.isValidAccountId(request.accountId)) {
          throw new Error(`Invalid account ID format: ${request.accountId}`);
        }

        // Check if account already exists
        this.logger.info(`Checking if account ${request.accountId} already exists...`);
        const accountExists = await this.checkAccountExists(request.accountId);
        if (accountExists) {
          throw new Error(`Account ${request.accountId} already exists. Cannot create duplicate account.`);
        }
        this.logger.info(`Account ${request.accountId} is available for creation`);

        const initialBalance = this.config.accountInitialBalance;

        this.logger.info(`Creating account: ${request.accountId}`);
        this.logger.info(`Initial balance: ${initialBalance} yoctoNEAR`);

        // Build actions for CreateAccount + Transfer + AddKey(FullAccess)
        const actions: ActionArgsWasm[] = [
          { action_type: ActionType.CreateAccount },
          { action_type: ActionType.Transfer, deposit: initialBalance },
          {
            action_type: ActionType.AddKey,
            public_key: request.publicKey,
            access_key: JSON.stringify({
              nonce: 0,
              permission: { FullAccess: {} },
            }),
          }
        ];

        actions.forEach(validateActionArgsWasm);

        // Fetch nonce and block hash for relayer
        const { nextNonce, blockHash } = await this.fetchTxContext(this.config.relayerAccountId, this.relayerPublicKey);

        // Sign with relayer private key using WASM
        const signed = await this.signWithPrivateKey({
          nearPrivateKey: this.config.relayerPrivateKey,
          signerAccountId: this.config.relayerAccountId,
          receiverId: request.accountId,
          nonce: nextNonce,
          blockHash: blockHash,
          actions
        });

        // Broadcast transaction via MinimalNearClient using a strongly typed SignedTransaction
        const result = await this.nearClient.sendTransaction(signed);

        this.logger.info(`Account creation completed: ${result.transaction.hash}`);
        const nearAmount = (Number(BigInt(initialBalance)) / 1e24).toFixed(6);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          accountId: request.accountId,
          message: `Account ${request.accountId} created with ${nearAmount} NEAR initial balance`
        };

      } catch (error: any) {
        this.logger.error(`Account creation failed for ${request.accountId}:`, error);
        return {
          success: false,
          error: error.message || 'Unknown account creation error',
          message: `Failed to create account ${request.accountId}: ${error.message}`
        };
      }
    }, `create account ${request.accountId}`);
  }

  /**
   * Create account and register user with WebAuthn in a single atomic transaction
   */
  async createAccountAndRegisterUser(request: CreateAccountAndRegisterRequest): Promise<CreateAccountAndRegisterResult> {
    await this._ensureSignerAndRelayerAccount();

    return this.queueTransaction(async () => {
      try {
        if (!this.isValidAccountId(request.new_account_id)) {
          throw new Error(`Invalid account ID format: ${request.new_account_id}`);
        }

        // Check if account already exists
        this.logger.info(`Checking if account ${request.new_account_id} already exists...`);
        const accountExists = await this.checkAccountExists(request.new_account_id);
        if (accountExists) {
          throw new Error(`Account ${request.new_account_id} already exists. Cannot create duplicate account.`);
        }
        this.logger.info(`Account ${request.new_account_id} is available for atomic creation and registration`);
        this.logger.info(`Registering account: ${request.new_account_id}`);
        this.logger.info(`Contract: ${this.config.webAuthnContractId}`);

        // Prepare contract arguments
        const contractArgs = {
          new_account_id: request.new_account_id,
          new_public_key: request.new_public_key,
          vrf_data: request.vrf_data,
          webauthn_registration: request.webauthn_registration,
          deterministic_vrf_public_key: request.deterministic_vrf_public_key,
          authenticator_options: request.authenticator_options,
        };

        // Build single FunctionCall action
        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'create_account_and_register_user',
            args: JSON.stringify(contractArgs),
            gas: this.config.createAccountAndRegisterGas,
            deposit: this.config.accountInitialBalance
          }
        ];
        actions.forEach(validateActionArgsWasm);

        const { nextNonce, blockHash } = await this.fetchTxContext(this.config.relayerAccountId, this.relayerPublicKey);
        const signed = await this.signWithPrivateKey({
          nearPrivateKey: this.config.relayerPrivateKey,
          signerAccountId: this.config.relayerAccountId,
          receiverId: this.config.webAuthnContractId,
          nonce: nextNonce,
          blockHash,
          actions
        });
        const result = await this.nearClient.sendTransaction(signed);

        // Parse contract execution results to detect failures
        const contractError = parseContractExecutionError(result, request.new_account_id);
        if (contractError) {
          this.logger.error(`Contract execution failed for ${request.new_account_id}:`, contractError);
          throw new Error(contractError);
        }

        this.logger.info(`Registration completed: ${result.transaction.hash}`);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `Account ${request.new_account_id} created and registered successfully`,
          contractResult: result,
        };

      } catch (error: any) {
        this.logger.error(`Atomic registration failed for ${request.new_account_id}:`, error);
        return {
          success: false,
          error: error.message || 'Unknown atomic registration error',
          message: `Failed to create and register account ${request.new_account_id}: ${error.message}`
        };
      }
    }, `atomic create and register ${request.new_account_id}`);
  }

  /**
   * Verify authentication response and issue JWT (VIEW call)
   * Calls the web3authn contract's verify_authentication_response method via view
   * and issues a JWT or session credential upon successful verification
   */
  async verifyAuthenticationResponse(
    request: VerifyAuthenticationRequest
  ): Promise<VerifyAuthenticationResponse> {
    try {
      await this._ensureSignerAndRelayerAccount();

      const intentDigest32 = request?.vrf_data?.intent_digest_32;
      if (!Array.isArray(intentDigest32) || intentDigest32.length !== 32) {
        return {
          success: false,
          verified: false,
          code: 'invalid_intent_digest',
          message: 'Missing or invalid vrf_data.intent_digest_32 (expected 32 bytes)',
        };
      }
      const sessionPolicyDigest32 = (request?.vrf_data as { session_policy_digest_32?: unknown })?.session_policy_digest_32;
      if (sessionPolicyDigest32 !== undefined) {
        if (!Array.isArray(sessionPolicyDigest32) || sessionPolicyDigest32.length !== 32) {
          return {
            success: false,
            verified: false,
            code: 'invalid_session_policy_digest',
            message: 'Invalid vrf_data.session_policy_digest_32 (expected 32 bytes when present)',
          };
        }
      }

      const args = {
        vrf_data: request.vrf_data,
        webauthn_authentication: request.webauthn_authentication,
      };

      // Perform a VIEW function call (no gas) and parse the contract response
      const contractResponse = await this.nearClient.view<typeof args, unknown>({
        account: this.config.webAuthnContractId,
        method: 'verify_authentication_response',
        args
      });

      const verified = isObject(contractResponse) && contractResponse.verified === true;
      if (!verified) {
        return {
          success: false,
          verified: false,
          code: 'not_verified',
          message: 'Authentication verification failed',
          contractResponse,
        };
      }

      return {
        success: true,
        verified: true,
        sessionCredential: {
          userId: request.vrf_data.user_id,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        contractResponse,
      };
    } catch (error: any) {
      return {
        success: false,
        verified: false,
        code: 'internal',
        message: error?.message || 'Verification failed',
      };
    }
  }

  /**
   * Fetch Related Origin Requests (ROR) allowed origins from a NEAR view method.
   * Defaults: contractId = webAuthnContractId, method = 'get_allowed_origins', args = {}.
   * Returns a sanitized, deduplicated list of absolute origins.
   */
  public async getRorOrigins(opts?: { contractId?: string; method?: string; args?: unknown }): Promise<string[]> {
    const contractId = toOptionalTrimmedString(opts?.contractId) || this.config.webAuthnContractId.trim();
    const method = toOptionalTrimmedString(opts?.method) || 'get_allowed_origins';
    const args = opts?.args ?? {};

    const isValidOrigin = (s: unknown): string | null => {
      if (typeof s !== 'string' || !s) return null;
      try {
        const u = new URL(s.trim());
        const scheme = u.protocol;
        const host = u.hostname.toLowerCase();
        const port = u.port ? `:${u.port}` : '';
        if (scheme !== 'https:' && !(scheme === 'http:' && host === 'localhost')) return null;
        if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return null;
        return `${scheme}//${host}${port}`;
      } catch { return null; }
    };

    try {
      const result = await this.nearClient.view<unknown, unknown>({ account: contractId, method, args });
      const list: string[] = (() => {
        if (Array.isArray(result)) return result.filter((v): v is string => typeof v === 'string');
        if (isObject(result) && Array.isArray(result.origins)) {
          return (result.origins as unknown[]).filter((v): v is string => typeof v === 'string');
        }
        return [];
      })();
      const out = new Set<string>();
      for (const item of list) {
        const norm = isValidOrigin(item);
        if (norm) out.add(norm);
      }
      return Array.from(out);
    } catch (e) {
      this.logger.warn('[AuthService] getRorOrigins failed:', e);
      return [];
    }
  }

  private isValidAccountId(accountId: string): boolean {
    if (!accountId || accountId.length < 2 || accountId.length > 64) {
      return false;
    }
    const validPattern = /^[a-z0-9_.-]+$/;
    return validPattern.test(accountId);
  }

  /**
   * Account existence helper used by registration flows.
   */
  async checkAccountExists(accountId: string): Promise<boolean> {
    await this._ensureSignerAndRelayerAccount();
    const isNotFound = (m: string) => /does not exist|UNKNOWN_ACCOUNT|unknown\s+account/i.test(m);
    const isRetryable = (m: string) => /server error|internal|temporar|timeout|too many requests|429|empty response|rpc request failed/i.test(m);
    const attempts = 3;
    let lastErr: any = null;
    for (let i = 1; i <= attempts; i++) {
      try {
        const view = await this.nearClient.viewAccount(accountId);
        return !!view;
      } catch (error: any) {
        lastErr = error;
        const msg = String(error?.message || '');
        // Some providers embed the useful string only inside a nested JSON `details` object.
        // Normalize both message and details (if available) into one searchable blob.
        const detailsBlob = (() => {
          try {
            const d = (error && typeof error === 'object' && 'details' in error) ? (error as any).details : undefined;
            if (!d) return '';
            return typeof d === 'string' ? d : JSON.stringify(d);
          } catch { return ''; }
        })();
        const combined = `${msg}\n${detailsBlob}`;
        if (isNotFound(combined)) return false;
        if (isRetryable(msg) && i < attempts) {
          const backoff = 150 * Math.pow(2, i - 1);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        // As a safety valve for flaky RPCs, treat persistent retryable errors as not-found
        if (isRetryable(msg)) {
          this.logger.warn(`[AuthService] Assuming account '${accountId}' not found after retryable RPC errors:`, msg);
          return false;
        }
        this.logger.error(`Error checking account existence for ${accountId}:`, error);
        throw error;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /**
   * ===== Delegate actions & transaction execution =====
   *
   * Flows that build and submit on-chain transactions, including NEP-461
   * SignedDelegate meta-transactions.
   */

  /**
   * Execute a NEP-461 SignedDelegate by wrapping it in an outer transaction
   * from the relayer account. This method is intended to be called by
   * example relayers (Node/Cloudflare) once a SignedDelegate has been
   * produced by the signer worker and returned to the application.
   *
   * Notes:
   * - Signature and hash computation are performed by the signer worker.
   *   This method focuses on expiry/policy enforcement and meta-tx submission.
   * - Nonce/replay protection is left to the integrator; see docs for guidance.
   */
  async executeSignedDelegate(input: {
    hash: string;
    signedDelegate: SignedDelegate;
    policy?: DelegateActionPolicy;
  }): Promise<ExecuteSignedDelegateResult> {
    await this._ensureSignerAndRelayerAccount();

    if (!input?.hash || !input?.signedDelegate) {
      return {
        ok: false,
        code: 'invalid_delegate_request',
        error: 'hash and signedDelegate are required',
      };
    }

    const senderId = input.signedDelegate?.delegateAction?.senderId ?? 'unknown-sender';

    return this.queueTransaction(
      () => executeSignedDelegateWithRelayer({
        nearClient: this.nearClient,
        relayerAccountId: this.config.relayerAccountId,
        relayerPublicKey: this.relayerPublicKey,
        relayerPrivateKey: this.config.relayerPrivateKey,
        hash: input.hash,
        signedDelegate: input.signedDelegate,
        signWithPrivateKey: (args) => this.signWithPrivateKey(args),
      }),
      `execute signed delegate for ${senderId}`,
    );
  }

  // === Internal helpers for signing & RPC ===
  private async fetchTxContext(accountId: string, publicKey: string): Promise<{ nextNonce: string; blockHash: string }> {
    // Access key (if missing, assume nonce=0)
    let nonce = 0n;
    try {
      const ak = await this.nearClient.viewAccessKey(accountId, publicKey);
      nonce = BigInt(ak?.nonce ?? 0);
    } catch {
      nonce = 0n;
    }
    // Block
    const block = await this.nearClient.viewBlock({ finality: 'final' });
    const txBlockHash = block.header.hash;
    const nextNonce = (nonce + 1n).toString();
    return { nextNonce, blockHash: txBlockHash };
  }

  private async signWithPrivateKey(input: {
    nearPrivateKey: string;
    signerAccountId: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    actions: ActionArgsWasm[];
  }): Promise<SignedTransaction> {
    await this.ensureSignerWasm();
    const message = {
      type: WorkerRequestType.SignTransactionWithKeyPair,
      payload: {
        nearPrivateKey: input.nearPrivateKey,
        signerAccountId: input.signerAccountId,
        receiverId: input.receiverId,
        nonce: input.nonce,
        blockHash: input.blockHash,
        actions: input.actions
      }
    };
    // uses wasm signer worker's SignTransactionWithKeyPair action,
    // which doesn't require VRF worker session
    const response = await handle_signer_message(message);
    const {
      transaction,
      signature,
      borshBytes
    } = extractFirstSignedTransactionFromWorkerResponse(response);

    return new SignedTransaction({
      transaction: transaction,
      signature: signature,
      borsh_bytes: borshBytes,
    });
  }

  /**
   * Framework-agnostic: handle verify-authentication request
   * Converts a generic ServerRequest to ServerResponse using this service
   */
  async handleVerifyAuthenticationResponse(request: VerifyAuthenticationRequest): Promise<VerifyAuthenticationResponse> {
    return this.verifyAuthenticationResponse(request);
  }

  /**
   * ZK-email recovery helper (stub).
   * Intended to call the global ZkEmailVerifier and per-user recovery contract
   * once zk-email proofs and public inputs are wired through.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async recoverAccountFromZkEmailVerifier(_request: {
    accountId: string;
    proof: unknown;
    publicInputs: unknown;
  }): Promise<{
    success: boolean;
    transactionHash?: string;
    message?: string;
    error?: string;
  }> {
    return {
      success: false,
      error: 'recoverAccountFromZkEmailVerifier is not yet implemented',
      message: 'recoverAccountFromZkEmailVerifier is not yet implemented',
    };
  }

  /**
   * Express-style middleware factory for verify-authentication
   */
  verifyAuthenticationMiddleware() {
    return async (req: any, res: any) => {
      try {
        if (!req?.body) {
          res.status(400).json({ error: 'Request body is required' });
          return;
        }
        const body: VerifyAuthenticationRequest = req.body;
        if (!body.vrf_data || !body.webauthn_authentication) {
          res.status(400).json({ code: 'invalid_body', message: 'vrf_data and webauthn_authentication are required' });
          return;
        }
        const result = await this.verifyAuthenticationResponse(body);
        const status = result.success ? 200 : 400;
        if (status !== 200) {
          res.status(status).json({ code: 'not_verified', message: result.message || 'Authentication verification failed' });
        } else {
          res.status(status).json(result);
        }
      } catch (error: any) {
        this.logger.error('Error in verify authentication middleware:', error);
        res.status(500).json({ code: 'internal', message: error?.message || 'Internal server error' });
      }
    };
  }

  /**
   * Queue transactions to prevent nonce conflicts
   */
  private async queueTransaction<T>(operation: () => Promise<T>, description: string): Promise<T> {
    this.queueStats.pending++;
    this.logger.debug(`[AuthService] Queueing: ${description} (pending: ${this.queueStats.pending})`);

    this.transactionQueue = this.transactionQueue
      .then(async () => {
        try {
          this.logger.debug(`[AuthService] Executing: ${description}`);
          const result = await operation();
          this.queueStats.completed++;
          this.queueStats.pending--;
          this.logger.debug(`[AuthService] Completed: ${description} (pending: ${this.queueStats.pending})`);
          return result;
        } catch (error: any) {
          this.queueStats.failed++;
          this.queueStats.pending--;
          this.logger.error(`[AuthService] Failed: ${description} (failed: ${this.queueStats.failed}):`, error?.message);
          throw error;
        }
      })
      .catch((error) => {
        throw error;
      });

    return this.transactionQueue;
  }
}

interface WorkerSignedTransactionPayload {
  transaction: WasmTransaction;
  signature: WasmSignature;
  borshBytes?: number[];
  borsh_bytes?: number[];
}

function extractFirstSignedTransactionFromWorkerResponse(response: any): {
  transaction: WasmTransaction;
  signature: WasmSignature;
  borshBytes: number[];
} {
  const res = (typeof response === 'string' ? JSON.parse(response) : response) as {
    type?: WorkerResponseType;
    payload?: { signedTransactions?: WorkerSignedTransactionPayload[]; error?: string };
  } | undefined;

  if (res?.type !== WorkerResponseType.SignTransactionWithKeyPairSuccess) {
    const errMsg = res?.payload?.error || 'Signing failed';
    throw new Error(errMsg);
  }

  const payload = res?.payload;
  const signedTxs = (payload?.signedTransactions ?? []) as WorkerSignedTransactionPayload[];
  if (!Array.isArray(signedTxs) || signedTxs.length === 0) {
    throw new Error('No signed transaction returned');
  }
  const first = signedTxs[0];
  const borshBytes = first?.borshBytes ?? first?.borsh_bytes;
  if (!Array.isArray(borshBytes)) {
    throw new Error('Missing borsh bytes');
  }
  return {
    transaction: first.transaction,
    signature: first.signature,
    borshBytes,
  };
}
