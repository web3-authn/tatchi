import type {
  AuthServiceConfig,
  ShamirApplyServerLockRequest,
  ShamirApplyServerLockResponse,
  ShamirRemoveServerLockRequest,
  ShamirRemoveServerLockResponse,
} from './types';
import { isString } from '@/utils/validation';
import { Shamir3PassUtils, setShamirWasmModuleOverride } from './shamirWorker';

type ShamirConfig = AuthServiceConfig['shamir'];

type GraceKeySpec = { e_s_b64u: string; d_s_b64u: string };

export class ShamirService {
  private config: ShamirConfig | undefined;
  private graceKeysFilePath: string | null;

  private shamir3pass: Shamir3PassUtils | null = null;
  private graceKeys: Map<string, Shamir3PassUtils> = new Map();
  private graceKeySpecs: Map<string, GraceKeySpec> = new Map();
  private graceKeysLoaded = false;
  private graceKeysLoadPromise: Promise<void> | null = null;

  constructor(config: ShamirConfig | undefined, graceKeysFilePath: string | null) {
    this.config = config;
    const graceFileCandidate = (this.config?.graceShamirKeysFile || '').trim();
    this.graceKeysFilePath = graceKeysFilePath || graceFileCandidate || 'grace-keys.json';
  }

  hasShamir(): boolean {
    return Boolean(this.config && this.shamir3pass);
  }

  getShamirConfig(): ShamirConfig | undefined {
    return this.config;
  }

  getCurrentShamirKeyId(): string | null {
    return this.shamir3pass?.getCurrentKeyId?.() || null;
  }

  getGraceKeyIds(): string[] {
    return Array.from(this.graceKeys.keys());
  }

  hasGraceKey(keyId: string): boolean {
    return this.graceKeys.has(keyId);
  }

  async ensureReady(): Promise<boolean> {
    if (!this.config) {
      return false;
    }
    if (this.shamir3pass) {
      return true;
    }

    try {
      // Configure WASM override when provided (e.g. Cloudflare Workers).
      // This ensures Shamir endpoints like /vrf/apply-server-lock work
      // even when AuthService._ensureSignerAndRelayerAccount has not run.
      if (this.config.moduleOrPath) {
        try {
          setShamirWasmModuleOverride(this.config.moduleOrPath);
        } catch (error) {
          console.warn('[ShamirService] Failed to configure Shamir WASM override:', error);
        }
      }

      this.shamir3pass = new Shamir3PassUtils({
        p_b64u: this.config.shamir_p_b64u,
        e_s_b64u: this.config.shamir_e_s_b64u,
        d_s_b64u: this.config.shamir_d_s_b64u,
      });
      try {
        await this.shamir3pass.initialize();
      } catch {
        // Initialization failures are logged by Shamir3PassUtils; treat as non-fatal
      }
      await this.ensureGraceKeysLoaded();
    } catch (err) {
      console.error('Failed to initialize Shamir 3-pass:', err);
    }

    return this.hasShamir();
  }

  async ensureGraceKeysLoaded(): Promise<void> {
    if (this.graceKeysLoaded) {
      return;
    }
    if (this.graceKeysLoadPromise) {
      await this.graceKeysLoadPromise;
      return;
    }

    this.graceKeysLoadPromise = (async () => {
      const specs: GraceKeySpec[] = [];

      const fileSpecs = await this.loadGraceKeysFromFile();
      if (fileSpecs.length) {
        specs.push(...fileSpecs);
      }

      if (Array.isArray(this.config?.graceShamirKeys) && this.config!.graceShamirKeys!.length) {
        specs.push(...(this.config!.graceShamirKeys as any));
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

  private async loadGraceKeysFromFile(): Promise<GraceKeySpec[]> {
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
        console.warn(`[ShamirService] Grace keys file ${filePath} is not an array; ignoring contents`);
        return [];
      }
      const normalized: GraceKeySpec[] = [];
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
        console.warn(`[ShamirService] Failed to read grace keys file ${filePath}:`, error);
      }
      return [];
    }
  }

  private syncGraceKeySpecsToConfig(): void {
    if (!this.config) return;

    if (this.graceKeySpecs.size === 0) {
      this.config.graceShamirKeys = undefined;
      return;
    }

    this.config.graceShamirKeys = Array.from(this.graceKeySpecs.values()).map((spec) => ({
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
      console.warn(`[ShamirService] Failed to persist grace keys to ${filePath}:`, error);
    }
  }

  async addGraceKeyInternal(
    spec: { e_s_b64u: string; d_s_b64u: string },
    opts?: { persist?: boolean; skipIfExists?: boolean }
  ): Promise<{ keyId: string } | null> {
    await this.ensureGraceKeysLoaded();

    const e = spec?.e_s_b64u;
    const d = spec?.d_s_b64u;
    if (!isString(e) || !e || !isString(d) || !d) {
      return null;
    }

    const p_b64u = this.config?.shamir_p_b64u;
    if (!p_b64u) {
      console.warn('[ShamirService] Missing Shamir p_b64u; cannot add grace key');
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
        console.warn('[ShamirService] Failed to initialize grace Shamir key (skipped):', error);
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

  async removeGraceKeyInternal(
    keyId: string,
    opts?: { persist?: boolean }
  ): Promise<boolean> {
    await this.ensureGraceKeysLoaded();
    if (!isString(keyId) || !keyId) {
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

  async applyServerLock(kek_c_b64u: string): Promise<ShamirApplyServerLockResponse> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    return this.shamir3pass.applyServerLock({ kek_c_b64u } as ShamirApplyServerLockRequest);
  }

  async removeServerLock(kek_cs_b64u: string): Promise<ShamirRemoveServerLockResponse> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    return this.shamir3pass.removeServerLock({ kek_cs_b64u } as ShamirRemoveServerLockRequest);
  }

  async generateShamirServerKeypair(): Promise<{ e_s_b64u: string; d_s_b64u: string; keyId: string | null }> {
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');

    const { e_s_b64u, d_s_b64u } = await this.shamir3pass.generateServerKeypair();
    const p_b64u = this.config?.shamir_p_b64u;
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
      console.warn('[ShamirService] Failed to derive keyId for generated Shamir keypair:', error);
    }

    return { e_s_b64u, d_s_b64u, keyId };
  }

  async rotateShamirServerKeypair(options?: {
    keepCurrentInGrace?: boolean;
    persistGraceToDisk?: boolean;
  }): Promise<{
    newKeypair: { e_s_b64u: string; d_s_b64u: string };
    newKeyId: string | null;
    previousKeyId: string | null;
    graceKeyIds: string[];
  }> {
    await this.ensureGraceKeysLoaded();
    if (!this.shamir3pass) throw new Error('Shamir3Pass not initialized');
    if (!this.config) throw new Error('Shamir not configured');

    const keepCurrentInGrace = options?.keepCurrentInGrace !== false;
    const persistGrace = options?.persistGraceToDisk !== false;

    const previousKeyId = this.shamir3pass.getCurrentKeyId();
    const previousKeypair = {
      e_s_b64u: this.config.shamir_e_s_b64u,
      d_s_b64u: this.config.shamir_d_s_b64u,
    };

    const { e_s_b64u: newE, d_s_b64u: newD } = await this.shamir3pass.generateServerKeypair();
    const newUtil = new Shamir3PassUtils({
      p_b64u: this.config.shamir_p_b64u,
      e_s_b64u: newE,
      d_s_b64u: newD,
    });

    await newUtil.initialize();

    this.shamir3pass = newUtil;
    this.config.shamir_e_s_b64u = newE;
    this.config.shamir_d_s_b64u = newD;

    const newKeyId = newUtil.getCurrentKeyId();

    if (
      keepCurrentInGrace
      && previousKeyId
      && isString(previousKeypair.e_s_b64u)
      && isString(previousKeypair.d_s_b64u)
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

  async handleRotateShamirKeypair(request: { keepOldInGrace?: boolean }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }> {
    try {
      const keepOldInGrace = request?.keepOldInGrace !== false;
      const result = await this.rotateShamirServerKeypair({ keepCurrentInGrace: keepOldInGrace });
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      };
    } catch (e: any) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal', details: e?.message }),
      };
    }
  }

  async removeGraceServerLockWithKey(
    keyId: string,
    request: ShamirRemoveServerLockRequest,
  ): Promise<ShamirRemoveServerLockResponse> {
    const util = this.graceKeys.get(keyId)!;
    return util.removeServerLock(request);
  }

  private isNodeEnvironment(): boolean {
    const isNode = Boolean((globalThis as any).process?.versions?.node);
    const isCloudflareWorker = typeof (globalThis as any).WebSocketPair !== 'undefined'
      || (typeof navigator !== 'undefined' && (navigator as any).userAgent?.includes?.('Cloudflare-Workers'));
    return isNode && !isCloudflareWorker;
  }
}
