import type { FinalExecutionOutcome } from '@near-js/types';
import { MinimalNearClient } from '../../core/NearClient';
import { ActionType, type ActionArgsWasm, validateActionArgsWasm } from '../../core/types/actions';
import { parseNearSecretKey, toPublicKeyString } from '../../core/nearCrypto';
import initSignerWasm, {
  handle_signer_message,
  WorkerRequestType,
  WorkerResponseType,
  type InitInput
} from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';
import { validateConfigs } from './config';
import { isObject, isString } from '../../core/WalletIframe/validation';

// =============================
// WASM URL CONSTANTS + HELPERS
// =============================

// Primary location (preserveModules output)
const SIGNER_WASM_MAIN_PATH = '../../wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm';
// Fallback location (dist/workers copy step)
const SIGNER_WASM_FALLBACK_PATH = '../../../workers/wasm_signer_worker_bg.wasm';

function getSignerWasmUrls(): URL[] {
  const paths = [SIGNER_WASM_MAIN_PATH, SIGNER_WASM_FALLBACK_PATH];
  const resolved: URL[] = [];
  const baseUrl = import.meta.url;

  for (const path of paths) {
    try {
      if (!baseUrl) throw new Error('import.meta.url is undefined');
      resolved.push(new URL(path, baseUrl));
    } catch (err) {
      console.warn(`Failed to resolve signer WASM relative URL for path "${path}":`, err);
    }
  }

  if (!resolved.length) {
    throw new Error('Unable to resolve signer WASM location from import.meta.url. Provide AuthServiceConfig.signerWasm.moduleOrPath in this runtime.');
  }

  return resolved;
}
import {
  Shamir3PassUtils,
} from './shamirWorker';
import type {
  AuthServiceConfig,
  AccountCreationRequest,
  AccountCreationResult,
  CreateAccountAndRegisterRequest,
  CreateAccountAndRegisterResult,
  NearExecutionFailure,
  NearReceiptOutcomeWithId,
  VerifyAuthenticationRequest,
  VerifyAuthenticationResponse,
  ShamirApplyServerLockRequest,
  ShamirRemoveServerLockRequest,
  ShamirApplyServerLockResponse,
  ShamirRemoveServerLockResponse,
  SignerWasmModuleSupplier,
} from './types';

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

  // Transaction queue to prevent nonce conflicts
  private transactionQueue: Promise<any> = Promise.resolve();
  private queueStats = { pending: 0, completed: 0, failed: 0 };

  // Shamir 3-pass key management
  private shamir3pass: Shamir3PassUtils | null = null;
  private graceKeys: Map<string, Shamir3PassUtils> = new Map();
  private graceKeySpecs: Map<string, { e_s_b64u: string; d_s_b64u: string }> = new Map();
  private graceKeysFilePath: string | null = null;
  private graceKeysLoaded = false;
  private graceKeysLoadPromise: Promise<void> | null = null;

  constructor(config: AuthServiceConfig) {
    validateConfigs(config);

    this.config = {
      // Use defaults if not set
      relayerAccountId: config.relayerAccountId,
      relayerPrivateKey: config.relayerPrivateKey,
      webAuthnContractId: config.webAuthnContractId,
      nearRpcUrl: config.nearRpcUrl
        || 'https://rpc.testnet.near.org',
      networkId: config.networkId
        || 'testnet',
      accountInitialBalance: config.accountInitialBalance
        || '50000000000000000000000', // 0.05 NEAR
      createAccountAndRegisterGas: config.createAccountAndRegisterGas
        || '120000000000000', // 120 TGas
      shamir: config.shamir,
      signerWasm: config.signerWasm,
    };
    const graceFileCandidate = (this.config.shamir?.graceShamirKeysFile || '').trim();
    this.graceKeysFilePath = graceFileCandidate || 'grace-keys.json';
    this.nearClient = new MinimalNearClient(this.config.nearRpcUrl);
  }

  /**
   * Returns true when Shamir 3-pass is configured and initialized.
   */
  public hasShamir(): boolean {
    return Boolean(this.config.shamir && this.shamir3pass);
  }

  /**
   * Ensures Shamir 3-pass is ready (initializes if configured but not loaded).
   */
  public async ensureShamirReady(): Promise<boolean> {
    if (!this.config.shamir) {
      return false;
    }
    if (this.shamir3pass) {
      return true;
    }
    try {
      await this._ensureSignerAndRelayerAccount();
    } catch (err) {
      console.error('Failed to initialize Shamir 3-pass:', err);
    }
    return this.hasShamir();
  }

  // Backward-compat getter, no longer returns near-js Account
  async getRelayerAccount(): Promise<{ accountId: string; publicKey: string }> {
    await this._ensureSignerAndRelayerAccount();
    return { accountId: this.config.relayerAccountId, publicKey: this.relayerPublicKey };
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

    // Initialize Shamir3Pass WASM module
    if (!this.shamir3pass && this.config.shamir) {
      // Configure WASM override for serverless environments (Cloudflare Workers, etc.)
      await this.configureShamirWasmForServerless();

      this.shamir3pass = new Shamir3PassUtils({
        p_b64u: this.config.shamir.shamir_p_b64u,
        e_s_b64u: this.config.shamir.shamir_e_s_b64u,
        d_s_b64u: this.config.shamir.shamir_d_s_b64u,
      });
      try { await this.shamir3pass.initialize(); } catch {}
    }

    await this.ensureGraceKeysLoaded();

    // Derive public key from configured relayer private key
    try {
      const { seed, pub } = parseNearSecretKey(this.config.relayerPrivateKey);
      this.relayerPublicKey = toPublicKeyString(pub);
    } catch (e) {
      console.warn('Failed to derive public key from relayerPrivateKey; ensure it is in ed25519:<base58> format');
      this.relayerPublicKey = '';
    }

    // Prepare signer WASM for transaction building/signing
    await this.ensureSignerWasm();
    this.isInitialized = true;
    console.log(`
    AuthService initialized with:
    • networkId: ${this.config.networkId}
    • nearRpcUrl: ${this.config.nearRpcUrl}
    • relayerAccountId: ${this.config.relayerAccountId}
    • webAuthnContractId: ${this.config.webAuthnContractId}
    • accountInitialBalance: ${this.config.accountInitialBalance} (${this.formatYoctoToNear(this.config.accountInitialBalance)} NEAR)
    • createAccountAndRegisterGas: ${this.config.createAccountAndRegisterGas} (${this.formatGasToTGas(this.config.createAccountAndRegisterGas)})
    ${this.config.shamir ? `• shamir_p_b64u: ${this.config.shamir.shamir_p_b64u.slice(0, 10)}...\n    • shamir_e_s_b64u: ${this.config.shamir.shamir_e_s_b64u.slice(0, 10)}...\n    • shamir_d_s_b64u: ${this.config.shamir.shamir_d_s_b64u.slice(0, 10)}...` : '• shamir: not configured'}
    `);
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
        console.error('Failed to initialize signer WASM via provided override:', e);
        throw e;
      }
    }

    let candidates: URL[];
    try {
      candidates = getSignerWasmUrls();
    } catch (err) {
      console.error('Failed to resolve signer WASM URLs:', err);
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
          console.warn(`Failed to initialize signer WASM from ${candidate.toString()}, trying next candidate...`);
        }
      }

      throw lastError ?? new Error('Unable to initialize signer WASM from any candidate URL');
    } catch (e) {
      console.error('Failed to initialize signer WASM:', e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  /**
   * Fetch Related Origin Requests (ROR) allowed origins from a NEAR view method.
   * Defaults: contractId = webAuthnContractId, method = 'get_allowed_origins', args = {}.
   * Returns a sanitized, deduplicated list of absolute origins.
   */
  public async getRorOrigins(opts?: { contractId?: string; method?: string; args?: any }): Promise<string[]> {
    const contractId = (opts?.contractId || this.config.webAuthnContractId).trim();
    const method = (opts?.method || 'get_allowed_origins').trim();
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
      const result = await this.nearClient.view<{ } , unknown>({ account: contractId, method, args });
      let list: string[] = [];
      if (Array.isArray(result)) {
        list = result as string[];
      } else if (result && typeof result === 'object' && Array.isArray((result as any).origins)) {
        list = (result as any).origins as string[];
      }
      const out = new Set<string>();
      for (const item of list) {
        const norm = isValidOrigin(item);
        if (norm) out.add(norm);
      }
      return Array.from(out);
    } catch (e) {
      console.warn('[AuthService] getRorOrigins failed:', e);
      return [];
    }
  }

  private isNodeEnvironment(): boolean {
    // Detect true Node.js, not Cloudflare Workers with nodejs_compat polyfills.
    const isNode = Boolean((globalThis as any).process?.versions?.node);
    // Cloudflare Workers expose WebSocketPair and may polyfill process.
    const isCloudflareWorker = typeof (globalThis as any).WebSocketPair !== 'undefined'
      || (typeof navigator !== 'undefined' && (navigator as any).userAgent?.includes?.('Cloudflare-Workers'));
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
        // Ensure we pass an ArrayBuffer, not a Node Buffer (type mismatch)
        const u8 = bytes instanceof Uint8Array ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes as any);
        const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        const module = await WebAssembly.compile(ab as ArrayBuffer);
        await initSignerWasm({ module_or_path: module as any });
        return;
      } catch {} // throw at end of function
    }

    // 2) Fallback: pass file path directly (supported in some environments)
    for (const url of candidates) {
      try {
        const filePath = fileURLToPath(url);
        await initSignerWasm({ module_or_path: filePath as any });
        return;
      } catch {} // throw at end of function
    }

    throw new Error('[AuthService] Failed to initialize signer WASM from filesystem candidates');
  }

  private async ensureGraceKeysLoaded(): Promise<void> {
    if (this.graceKeysLoaded) {
      return;
    }
    if (this.graceKeysLoadPromise) {
      await this.graceKeysLoadPromise;
      return;
    }

    this.graceKeysLoadPromise = (async () => {
      const specs: Array<{ e_s_b64u: string; d_s_b64u: string }> = [];

      const fileSpecs = await this.loadGraceKeysFromFile();
      if (fileSpecs.length) {
        specs.push(...fileSpecs);
      }

      if (Array.isArray(this.config.shamir?.graceShamirKeys) && this.config.shamir!.graceShamirKeys!.length) {
        specs.push(...(this.config.shamir!.graceShamirKeys as any));
      }

      if (specs.length) {
        for (const spec of specs) {
          await this.addGraceKeyInternal(spec, { persist: false, skipIfExists: true });
        }
      }

      this.graceKeysLoaded = true;
      this.syncGraceKeySpecsToConfig();
    })();

    try {
      await this.graceKeysLoadPromise;
    } finally {
      this.graceKeysLoadPromise = null;
      this.graceKeysLoaded = true;
    }
  }

  private async loadGraceKeysFromFile(): Promise<Array<{ e_s_b64u: string; d_s_b64u: string }>> {
    // Filesystem access is only possible in true Node.js environments.
    if (!this.isNodeEnvironment()) {
      return [];
    }
    const filePath = this.graceKeysFilePath?.trim();
    if (!filePath) {
      return [];
    }

    try {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn(`[AuthService] Grace keys file ${filePath} is not an array; ignoring contents`);
        return [];
      }
      const normalized: Array<{ e_s_b64u: string; d_s_b64u: string }> = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue;
        const e = (entry as any).e_s_b64u;
        const d = (entry as any).d_s_b64u;
        if (typeof e === 'string' && e && typeof d === 'string' && d) {
          normalized.push({ e_s_b64u: e, d_s_b64u: d });
        }
      }
      return normalized;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[AuthService] Failed to read grace keys file ${filePath}:`, error);
      }
      return [];
    }
  }

  private syncGraceKeySpecsToConfig(): void {
    if (this.graceKeySpecs.size === 0) {
      if (this.config.shamir) this.config.shamir.graceShamirKeys = undefined;
      return;
    }
    if (this.config.shamir) this.config.shamir.graceShamirKeys = Array.from(this.graceKeySpecs.values()).map((spec) => ({
      e_s_b64u: spec.e_s_b64u,
      d_s_b64u: spec.d_s_b64u,
    }));
  }

  private async persistGraceKeysToDisk(): Promise<void> {
    if (!this.isNodeEnvironment()) {
      return;
    }
    const filePath = this.graceKeysFilePath?.trim();
    if (!filePath) {
      return;
    }
    const entries = Array.from(this.graceKeySpecs.entries()).map(([keyId, spec]) => ({
      keyId,
      e_s_b64u: spec.e_s_b64u,
      d_s_b64u: spec.d_s_b64u,
    }));
    try {
      const { writeFile } = await import('node:fs/promises');
      const serialized = JSON.stringify(entries, null, 2);
      await writeFile(filePath, `${serialized}\n`, 'utf8');
    } catch (error) {
      console.warn(`[AuthService] Failed to persist grace keys to ${filePath}:`, error);
    }
  }

  private async addGraceKeyInternal(
    spec: { e_s_b64u: string; d_s_b64u: string },
    opts?: { persist?: boolean; skipIfExists?: boolean }
  ): Promise<{ keyId: string } | null> {
    const e = spec?.e_s_b64u;
    const d = spec?.d_s_b64u;
    if (typeof e !== 'string' || !e || typeof d !== 'string' || !d) {
      return null;
    }

    const p_b64u = this.config.shamir?.shamir_p_b64u;
    if (!p_b64u) {
      console.warn('[AuthService] Missing Shamir p_b64u; cannot add grace key');
      return null;
    }
    const util = new Shamir3PassUtils({
      p_b64u,
      e_s_b64u: e,
      d_s_b64u: d,
    });

    let keyId = util.getCurrentKeyId();
    if (!keyId) {
      try {
        await util.initialize();
        keyId = util.getCurrentKeyId();
      } catch (error) {
        console.warn('[AuthService] Failed to initialize grace Shamir key (skipped):', error);
        return null;
      }
    }

    if (!keyId) {
      return null;
    }

    if (opts?.skipIfExists && this.graceKeys.has(keyId)) {
      return { keyId };
    }

    if (!this.graceKeys.has(keyId)) {
      this.graceKeys.set(keyId, util);
    }
    if (!this.graceKeySpecs.has(keyId)) {
      this.graceKeySpecs.set(keyId, { e_s_b64u: e, d_s_b64u: d });
    }

    this.syncGraceKeySpecsToConfig();

    if (opts?.persist !== false) {
      await this.persistGraceKeysToDisk();
    }

    return { keyId };
  }

  private async removeGraceKeyInternal(
    keyId: string,
    opts?: { persist?: boolean }
  ): Promise<boolean> {
    await this.ensureGraceKeysLoaded();
    if (typeof keyId !== 'string' || !keyId) {
      return false;
    }
    const removedUtil = this.graceKeys.delete(keyId);
    const removedSpec = this.graceKeySpecs.delete(keyId);
    if (!removedUtil && !removedSpec) {
      return false;
    }
    this.syncGraceKeySpecsToConfig();
    if (opts?.persist !== false) {
      await this.persistGraceKeysToDisk();
    }
    return true;
  }
  /**
   * Shamir 3-pass: apply server exponent (registration step)
   * @param kek_c_b64u - base64url-encoded KEK_c (client locked key encryption key)
   * @returns base64url-encoded KEK_cs (server locked key encryption key)
   */
  async applyServerLock(kek_c_b64u: string): Promise<ShamirApplyServerLockResponse> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    return await this.shamir3pass.applyServerLock({ kek_c_b64u } as ShamirApplyServerLockRequest);
  }

  /**
   * Shamir 3-pass: remove server exponent (login step)
   */
  async removeServerLock(kek_cs_b64u: string): Promise<ShamirRemoveServerLockResponse> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    return await this.shamir3pass.removeServerLock({ kek_cs_b64u } as ShamirRemoveServerLockRequest);
  }

  /**
   * Generate a new Shamir3Pass server keypair without mutating current state.
   * Useful for previewing rotations or external persistence flows.
   */
  async generateShamirServerKeypair(): Promise<{ e_s_b64u: string; d_s_b64u: string; keyId: string | null }> {
    await this._ensureSignerAndRelayerAccount();
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');

    const { e_s_b64u, d_s_b64u } = await this.shamir3pass.generateServerKeypair();
    const p_b64u = this.config.shamir?.shamir_p_b64u;
    if (!p_b64u) throw new Error('Shamir not configured');
    const util = new Shamir3PassUtils({
      p_b64u,
      e_s_b64u,
      d_s_b64u,
    });
    let keyId: string | null = null;
    try {
      keyId = util.getCurrentKeyId();
      if (!keyId) {
        await util.initialize();
        keyId = util.getCurrentKeyId();
      }
    } catch (error) {
      console.warn('[AuthService] Failed to derive keyId for generated Shamir keypair:', error);
    }

    return { e_s_b64u, d_s_b64u, keyId };
  }

  /**
   * Rotate the active Shamir3Pass keypair while the service is running.
   * The previous key is optionally retained as a grace key and persisted to disk.
   */
  async rotateShamirServerKeypair(options?: {
    keepCurrentInGrace?: boolean;
    persistGraceToDisk?: boolean;
  }): Promise<{
    newKeypair: { e_s_b64u: string; d_s_b64u: string };
    newKeyId: string | null;
    previousKeyId: string | null;
    graceKeyIds: string[];
  }> {
    await this._ensureSignerAndRelayerAccount();
    await this.ensureGraceKeysLoaded();
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');

    const keepCurrentInGrace = options?.keepCurrentInGrace !== false;
    const persistGrace = options?.persistGraceToDisk !== false;

    const previousKeyId = this.shamir3pass.getCurrentKeyId();
    if (!this.config.shamir) throw new Error('Shamir not configured');
    const previousKeypair = {
      e_s_b64u: this.config.shamir.shamir_e_s_b64u,
      d_s_b64u: this.config.shamir.shamir_d_s_b64u,
    };

    const { e_s_b64u: newE, d_s_b64u: newD } = await this.shamir3pass.generateServerKeypair();
    const newUtil = new Shamir3PassUtils({
      p_b64u: this.config.shamir.shamir_p_b64u,
      e_s_b64u: newE,
      d_s_b64u: newD,
    });

    await newUtil.initialize();

    this.shamir3pass = newUtil;
    this.config.shamir = { ...this.config.shamir, shamir_e_s_b64u: newE, shamir_d_s_b64u: newD };

    const newKeyId = newUtil.getCurrentKeyId();

    if (
      keepCurrentInGrace
      && previousKeyId
      && typeof previousKeypair.e_s_b64u === 'string'
      && typeof previousKeypair.d_s_b64u === 'string'
    ) {
      await this.addGraceKeyInternal(previousKeypair, { persist: persistGrace, skipIfExists: true });
    } else if (persistGrace) {
      await this.persistGraceKeysToDisk();
    }

    return {
      newKeypair: { e_s_b64u: newE, d_s_b64u: newD },
      newKeyId,
      previousKeyId,
      graceKeyIds: Array.from(this.graceKeys.keys()),
    };
  }

  /**
   * Framework-agnostic: rotate Shamir keypair (HTTP wrapper used by example server)
   */
  async handleRotateShamirKeypair(request: { keepOldInGrace?: boolean }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      const keepOldInGrace = request?.keepOldInGrace !== false;
      const result = await this.rotateShamirServerKeypair({ keepCurrentInGrace: keepOldInGrace });
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  // Format NEAR gas (string) to TGas for display
  private formatGasToTGas(gasString: string): string {
    const gasAmount = BigInt(gasString);
    const tGas = Number(gasAmount) / 1e12;
    return `${tGas.toFixed(0)} TGas`;
  }

  // Convert yoctoNEAR to NEAR for display
  private formatYoctoToNear(yoctoAmount: string | bigint): string {
    const amount = isString(yoctoAmount) ? BigInt(yoctoAmount) : yoctoAmount;
    const nearAmount = Number(amount) / 1e24;
    return nearAmount.toFixed(3);
  }

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
        console.log(`Checking if account ${request.accountId} already exists...`);
        const accountExists = await this.checkAccountExists(request.accountId);
        if (accountExists) {
          throw new Error(`Account ${request.accountId} already exists. Cannot create duplicate account.`);
        }
        console.log(`Account ${request.accountId} is available for creation`);

        const initialBalance = this.config.accountInitialBalance;

        console.log(`Creating account: ${request.accountId}`);
        console.log(`Initial balance: ${initialBalance} yoctoNEAR`);

        // Build actions for CreateAccount + Transfer + AddKey(FullAccess)
        const actions: ActionArgsWasm[] = [
          { action_type: ActionType.CreateAccount },
          { action_type: ActionType.Transfer, deposit: initialBalance },
          {
            action_type: ActionType.AddKey,
            public_key: request.publicKey,
            access_key: JSON.stringify({ nonce: 0, permission: { FullAccess: {} } })
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

        // Broadcast transaction via MinimalNearClient
        const result = await this.nearClient.sendTransaction({ borshBytes: signed.borshBytes } as any);

        console.log(`Account creation completed: ${result.transaction.hash}`);
        const nearAmount = (Number(BigInt(initialBalance)) / 1e24).toFixed(6);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          accountId: request.accountId,
          message: `Account ${request.accountId} created with ${nearAmount} NEAR initial balance`
        };

      } catch (error: any) {
        console.error(`Account creation failed for ${request.accountId}:`, error);
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
        console.log(`Checking if account ${request.new_account_id} already exists...`);
        const accountExists = await this.checkAccountExists(request.new_account_id);
        if (accountExists) {
          throw new Error(`Account ${request.new_account_id} already exists. Cannot create duplicate account.`);
        }
        console.log(`Account ${request.new_account_id} is available for atomic creation and registration`);
        console.log(`Atomic registration for account: ${request.new_account_id}`);
        console.log(`Contract: ${this.config.webAuthnContractId}`);

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
        const result = await this.nearClient.sendTransaction({ borshBytes: signed.borshBytes } as any);

        // Parse contract execution results to detect failures
        const contractError = this.parseContractExecutionError(result, request.new_account_id);
        if (contractError) {
          console.error(`Contract execution failed for ${request.new_account_id}:`, contractError);
          throw new Error(contractError);
        }

        console.log(`Atomic registration completed: ${result.transaction.hash}`);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `Account ${request.new_account_id} created and registered successfully`,
          contractResult: result,
        };

      } catch (error: any) {
        console.error(`Atomic registration failed for ${request.new_account_id}:`, error);
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

      const args = {
        vrf_data: request.vrf_data,
        webauthn_authentication: request.webauthn_authentication,
      };

      // Perform a VIEW function call (no gas) and parse the contract response
      const contractResponse = await this.nearClient.view<typeof args, any>({
        account: this.config.webAuthnContractId,
        method: 'verify_authentication_response',
        args
      });

      const verified = Boolean((contractResponse && (contractResponse.verified === true)));
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

  // AuthService no longer exposes session helpers; routers should handle sessions via a provided adapter.

  /**
   * Parse contract response from execution outcome
   */
  private parseContractResponse(result: FinalExecutionOutcome): any {
    try {
      // For now, return a basic success response
      // In a real implementation, you'd parse the actual contract response
      return {
        verified: true,
        success: true,
      };
    } catch (error) {
      return {
        verified: false,
        error: 'Failed to parse contract response',
      };
    }
  }

  /**
   * Parse contract execution results to detect specific failure types
   */
  private parseContractExecutionError(result: FinalExecutionOutcome, accountId: string): string | null {
    try {
      // Check main transaction status
      if (result.status && isObject(result.status) && 'Failure' in result.status) {
        console.log(`Transaction failed:`, result.status.Failure);
        return `Transaction failed: ${JSON.stringify(result.status.Failure)}`;
      }

      // Check receipts for failures
      const receipts = (result.receipts_outcome || []) as NearReceiptOutcomeWithId[];
      for (const receipt of receipts) {
        const status = receipt.outcome?.status;

        if (status?.Failure) {
          const failure: NearExecutionFailure = status.Failure;
          console.log(`Receipt failure detected:`, failure);

          if (failure.ActionError?.kind) {
            const actionKind = failure.ActionError.kind;

            if (actionKind.AccountAlreadyExists) {
              return `Account ${actionKind.AccountAlreadyExists.accountId} already exists on NEAR network`;
            }

            if (actionKind.AccountDoesNotExist) {
              return `Referenced account ${actionKind.AccountDoesNotExist.account_id} does not exist`;
            }

            if (actionKind.InsufficientStake) {
              const stakeInfo = actionKind.InsufficientStake;
              return `Insufficient stake for account creation: ${stakeInfo.account_id}`;
            }

            if (actionKind.LackBalanceForState) {
              const balanceInfo = actionKind.LackBalanceForState;
              return `Insufficient balance for account state: ${balanceInfo.account_id}`;
            }

            return `Account creation failed: ${JSON.stringify(actionKind)}`;
          }

          return `Contract execution failed: ${JSON.stringify(failure)}`;
        }

        // Check logs for error keywords
        const logs = receipt.outcome?.logs || [];
        for (const log of logs) {
          if (isString(log)) {
            if (log.includes('AccountAlreadyExists') || log.includes('account already exists')) {
              return `Account ${accountId} already exists`;
            }
            if (log.includes('AccountDoesNotExist')) {
              return `Referenced account does not exist`;
            }
            if (log.includes('Cannot deserialize the contract state')) {
              return `Contract state deserialization failed. This may be due to a contract upgrade. Please try again or contact support.`;
            }
            if (log.includes('GuestPanic')) {
              return `Contract execution panic: ${log}`;
            }
          }
        }
      }

      return null;

    } catch (parseError: any) {
      console.warn(`Error parsing contract execution results:`, parseError);
      return null;
    }
  }

  private isValidAccountId(accountId: string): boolean {
    if (!accountId || accountId.length < 2 || accountId.length > 64) {
      return false;
    }
    const validPattern = /^[a-z0-9_.-]+$/;
    return validPattern.test(accountId);
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
  }): Promise<{ borshBytes: number[] }>
  {
    await this.ensureSignerWasm();
    const message = {
      type: WorkerRequestType.SignTransactionWithKeyPair,
      payload: {
        nearPrivateKey: input.nearPrivateKey,
        signerAccountId: input.signerAccountId,
        receiverId: input.receiverId,
        nonce: input.nonce,
        blockHash: input.blockHash,
        actions: JSON.stringify(input.actions)
      }
    };
    const responseJson = await handle_signer_message(JSON.stringify(message));
    const response = JSON.parse(responseJson);
    if (response.type !== WorkerResponseType.SignTransactionWithKeyPairSuccess) {
      throw new Error(response?.payload?.error || 'Signing failed');
    }
    const signedTxs = response?.payload?.signedTransactions || [];
    if (!signedTxs.length) throw new Error('No signed transaction returned');
    const signed = signedTxs[0];
    const borshBytes = signed?.borshBytes || signed?.borsh_bytes;
    if (!Array.isArray(borshBytes)) throw new Error('Missing borsh bytes');
    return { borshBytes };
  }

  /**
   * Framework-agnostic: handle verify-authentication request
   * Converts a generic ServerRequest to ServerResponse using this service
   */
  async handleVerifyAuthenticationResponse(request: VerifyAuthenticationRequest): Promise<VerifyAuthenticationResponse> {
    return this.verifyAuthenticationResponse(request);
  }

  /**
   * DKIM/TEE email recovery helper.
   * Relayer signs a function call to the per-user email-recoverer contract
   * deployed on `accountId`, passing the raw email blob for DKIM verification.
   */
  async recoverAccountFromEmailDKIMVerifier(request: { accountId: string; emailBlob: string }): Promise<{
    success: boolean;
    transactionHash?: string;
    message?: string;
    error?: string;
  }> {
    const accountId = (request.accountId || '').trim();
    const emailBlob = request.emailBlob;

    if (!this.isValidAccountId(accountId)) {
      return {
        success: false,
        error: `Invalid account ID format: ${accountId}`,
        message: `Invalid account ID format: ${accountId}`,
      };
    }
    if (!emailBlob || typeof emailBlob !== 'string') {
      return {
        success: false,
        error: 'emailBlob (raw email) is required',
        message: 'emailBlob (raw email) is required',
      };
    }

    await this._ensureSignerAndRelayerAccount();

    return this.queueTransaction(async () => {
      try {
        // Prepare contract arguments for verify_dkim_and_recover(email_blob: String)
        const contractArgs = {
          email_blob: emailBlob,
        };

        const actions: ActionArgsWasm[] = [
          {
            action_type: ActionType.FunctionCall,
            method_name: 'verify_dkim_and_recover',
            args: JSON.stringify(contractArgs),
            // Use generous gas similar to createAccountAndRegisterGas
            gas: this.config.createAccountAndRegisterGas,
            // Attach 0.01 NEAR as deposit for Outlayer/TEE DKIM verification (refunded minus fee).
            // 0.01 NEAR = 10^22 yocto.
            deposit: '10000000000000000000000',
          },
        ];
        actions.forEach(validateActionArgsWasm);

        const { nextNonce, blockHash } = await this.fetchTxContext(
          this.config.relayerAccountId,
          this.relayerPublicKey,
        );

        const signed = await this.signWithPrivateKey({
          nearPrivateKey: this.config.relayerPrivateKey,
          signerAccountId: this.config.relayerAccountId,
          receiverId: accountId,
          nonce: nextNonce,
          blockHash,
          actions,
        });

        const result = await this.nearClient.sendTransaction({ borshBytes: signed.borshBytes } as any);

        const contractError = this.parseContractExecutionError(result, accountId);
        if (contractError) {
          console.error(`[AuthService] Email recovery contract error for ${accountId}:`, contractError);
          return {
            success: false,
            error: contractError,
            message: contractError,
          };
        }

        console.log(`[AuthService] Email recovery flow completed for ${accountId}: ${result.transaction.hash}`);
        return {
          success: true,
          transactionHash: result.transaction.hash,
          message: `Email recovery flow executed for ${accountId}`,
        };
      } catch (error: any) {
        const msg = error?.message || 'Unknown email recovery error';
        console.error(`[AuthService] Email recovery failed for ${accountId}:`, msg);
        return {
          success: false,
          error: msg,
          message: msg,
        };
      }
    }, `email recovery (dkim) for ${accountId}`);
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
        console.error('Error in verify authentication middleware:', error);
        res.status(500).json({ code: 'internal', message: error?.message || 'Internal server error' });
      }
    };
  }

  /**
   * Framework-agnostic Shamir 3-pass: apply server lock
   */
  async handleApplyServerLock(request: {
    body: { kek_c_b64u: string }
  }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      if (!request.body) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing body' })
        };
      }
      if (!isString(request.body.kek_c_b64u) || !request.body.kek_c_b64u) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'kek_c_b64u required and must be a non-empty string' })
        };
      }
      const out = await this.applyServerLock(request.body.kek_c_b64u);
      const keyId = this.shamir3pass?.getCurrentKeyId?.();
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...out, keyId })
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  /**
   * Framework-agnostic Shamir 3-pass: remove server lock
   */
  async handleRemoveServerLock(request: {
    body: { kek_cs_b64u: string; keyId: string }
  }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      if (!request.body) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing body' })
        };
      }
      if (!isString(request.body.kek_cs_b64u) || !request.body.kek_cs_b64u) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'kek_cs_b64u required and must be a non-empty string' })
        };
      }
      if (!isString((request.body as any).keyId) || !(request.body as any).keyId) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'keyId required and must be a non-empty string' })
        };
      }
      const providedKeyId = String((request.body as any).keyId);
      const currentKeyId = this.shamir3pass?.getCurrentKeyId?.() || null;
      let out: ShamirRemoveServerLockResponse;
      if (currentKeyId && providedKeyId === currentKeyId) {
        out = await this.removeServerLock(request.body.kek_cs_b64u);
      } else if (this.graceKeys.has(providedKeyId)) {
        const util = this.graceKeys.get(providedKeyId)!;
        out = await util.removeServerLock({ kek_cs_b64u: request.body.kek_cs_b64u } as ShamirRemoveServerLockRequest);
      } else {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'unknown keyId' })
        };
      }
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(out)
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  /**
   * Framework-agnostic: GET /shamir/key-info
   */
  async handleGetShamirKeyInfo(): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      await this._ensureSignerAndRelayerAccount();
      const currentKeyId = this.shamir3pass?.getCurrentKeyId?.() || null;
      const graceKeyIds = Array.from(this.graceKeys.keys());
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentKeyId, p_b64u: this.config.shamir?.shamir_p_b64u ?? null, graceKeyIds })
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  /**
   * Framework-agnostic: list grace Shamir key IDs
   */
  async handleListGraceKeys(): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      await this.ensureGraceKeysLoaded();
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graceKeyIds: Array.from(this.graceKeys.keys()) })
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  /**
   * Framework-agnostic: add grace key
   */
  async handleAddGraceKey(request: { e_s_b64u: string; d_s_b64u: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      const { e_s_b64u, d_s_b64u } = request || ({} as any);
      if (!isString(e_s_b64u) || !e_s_b64u || !isString(d_s_b64u) || !d_s_b64u) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'e_s_b64u and d_s_b64u required' })
        };
      }
      await this.ensureGraceKeysLoaded();
      const added = await this.addGraceKeyInternal({ e_s_b64u, d_s_b64u }, { persist: true, skipIfExists: true });
      if (!added) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'failed to add grace key' })
        };
      }
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: added.keyId })
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

  /**
   * Framework-agnostic: remove grace key by keyId
   */
  async handleRemoveGraceKey(request: { keyId: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    try {
      const keyId = request?.keyId;
      if (!isString(keyId) || !keyId) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'keyId required and must be a non-empty string' })
        };
      }
      const removed = await this.removeGraceKeyInternal(keyId, { persist: true });
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removed })
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message })
      };
    }
  }

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
          console.warn(`[AuthService] Assuming account '${accountId}' not found after retryable RPC errors:`, msg);
          return false;
        }
        console.error(`Error checking account existence for ${accountId}:`, error);
        throw error;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /**
   * Queue transactions to prevent nonce conflicts
   */
  private async queueTransaction<T>(operation: () => Promise<T>, description: string): Promise<T> {
    this.queueStats.pending++;
    console.log(`[AuthService] Queueing: ${description} (pending: ${this.queueStats.pending})`);

    this.transactionQueue = this.transactionQueue
      .then(async () => {
        try {
          console.log(`[AuthService] Executing: ${description}`);
          const result = await operation();
          this.queueStats.completed++;
          this.queueStats.pending--;
          console.log(`[AuthService] Completed: ${description} (pending: ${this.queueStats.pending})`);
          return result;
        } catch (error: any) {
          this.queueStats.failed++;
          this.queueStats.pending--;
          console.error(`[AuthService] Failed: ${description} (failed: ${this.queueStats.failed}):`, error?.message);
          throw error;
        }
      })
      .catch((error) => {
        throw error;
      });

    return this.transactionQueue;
  }
}
