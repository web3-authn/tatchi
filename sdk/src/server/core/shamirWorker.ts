// Server-side and Worker-compatible Shamir 3-pass exponent helpers.
// Implements modular exponentiation over a shared safe prime p.
// Avoids Node-only imports at module scope so this file can be bundled for
// Cloudflare Workers without requiring Node built-ins.
// @ts-ignore - WASM imports
import initWasm, {
  handle_message as wasmHandleMessage,
  configure_shamir_p,
  get_shamir_p_b64u,
  SHAMIR_P_B64U,
  type InitInput,
} from '../../wasm_vrf_worker/pkg/wasm_vrf_worker.js';
import {
  VRFWorkerMessage,
  WasmVrfWorkerRequestType,
  ShamirApplyServerLockRequest,
  ShamirApplyServerLockResponse,
  ShamirRemoveServerLockRequest,
  ShamirRemoveServerLockResponse,
  Shamir3PassGenerateServerKeypairRequest,
} from './types.js';
import {
  createWasmLoader,
  createWasmLogger,
  isNodeEnvironment,
  type WasmModuleSupplier,
} from './wasm-loader.js';

export { SHAMIR_P_B64U, get_shamir_p_b64u };

type ShamirWasmModuleSupplier = WasmModuleSupplier<InitInput>;

let wasmInitialized = false;
let wasmModule: any;
let wasmModuleOverride: ShamirWasmModuleSupplier | null = null;
let wasmInitPromise: Promise<void> | null = null;

const logInit = createWasmLogger('ShamirWasmInit');

export function setShamirWasmModuleOverride(
  supplier: ShamirWasmModuleSupplier | null
): void {
  wasmModuleOverride = supplier;
  wasmInitialized = false;
  wasmModule = null;
  wasmInitPromise = null;
}

function simpleHash32(str: string): string {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Return hex string
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

const VRF_WASM_MAIN_PATH = '../../wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm';
const VRF_WASM_FALLBACK_PATH = '../../../workers/wasm_vrf_worker_bg.wasm';

function getVrfWasmUrls(): URL[] {
  return [
    new URL(VRF_WASM_MAIN_PATH, import.meta.url),
    new URL(VRF_WASM_FALLBACK_PATH, import.meta.url),
  ];
}

/**
 * Determine the type of WASM module input for logging and validation
 */
function getWasmInputType(input: unknown): string {
  if (!input) return 'null/undefined';
  if (input instanceof WebAssembly.Module) return 'WebAssembly.Module';
  if (input instanceof Response) return 'Response';
  if (input instanceof ArrayBuffer) return 'ArrayBuffer';
  if (ArrayBuffer.isView(input)) return 'TypedArray';
  if (typeof input === 'string') return 'string';
  return `${typeof input} (${Object.prototype.toString.call(input)})`;
}

/**
 * Handle string path resolution (Node.js only - Cloudflare Workers cannot use import.meta.url)
 */
function resolveStringPath(path: string): InitInput {
  if (!isNodeEnvironment()) {
    throw new Error(
      'Shamir WASM override cannot be a string path in Cloudflare Workers. ' +
      'Please provide a WebAssembly.Module or Response object via shamir.moduleOrPath config.'
    );
  }

  try {
    const finalUrl = new URL(path, import.meta.url);
    logInit(`override resolved (string->URL): ${finalUrl.toString()}`);
    return finalUrl as unknown as InitInput;
  } catch (err) {
    throw new Error(`Shamir WASM override produced invalid URL string: ${path}`);
  }
}

/**
 * Resolve WASM module override to a format accepted by wasm-bindgen's init function
 * Supports: WebAssembly.Module, Response, ArrayBuffer, TypedArray, or string paths (Node.js only)
 */
async function resolveWasmOverride(override: ShamirWasmModuleSupplier): Promise<InitInput> {
  // Unwrap function suppliers
  const candidate = typeof override === 'function'
    ? (override as () => InitInput | Promise<InitInput>)()
    : override;

  const resolved = await candidate;

  if (!resolved) {
    throw new Error('Shamir WASM override resolved to an empty value');
  }

  const inputType = getWasmInputType(resolved);
  logInit(`override resolved (${inputType})`);

  // Handle string paths (Node.js only)
  if (typeof resolved === 'string') {
    return resolveStringPath(resolved);
  }

  // All other types are passed directly to wasm-bindgen
  // (WebAssembly.Module, Response, ArrayBuffer, TypedArray, etc.)
  return resolved;
}

async function initWasmFromFilesystem(candidates: URL[]): Promise<boolean> {
  try {
    const { fileURLToPath } = await import('node:url');
    const { readFile } = await import('node:fs/promises');

    for (const url of candidates) {
      try {
        const p = fileURLToPath(url);
        const buf = await readFile(p);
        const u8 = buf instanceof Uint8Array
          ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
          : new Uint8Array(buf as any);
        const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        wasmModule = await initWasm({ module_or_path: ab as any });
        return true;
      } catch {
        // Try next candidate
      }
    }
  } catch {
    // Fall back to URL-based initialization
  }
  return false;
}

/**
 * Initialize WASM from explicit override (required for Cloudflare Workers)
 * @throws Error if override fails in non-Node environments
 */
async function initWasmFromOverride(): Promise<boolean> {
  if (!wasmModuleOverride) {
    return false;
  }

  logInit(`using override to initialize WASM (type: ${typeof wasmModuleOverride})`);

  try {
    const moduleOrPath = await resolveWasmOverride(wasmModuleOverride);
    logInit(`resolved override (type: ${typeof moduleOrPath}, isModule: ${moduleOrPath instanceof WebAssembly.Module})`);
    await initWasm({ module_or_path: moduleOrPath as any });
    logInit('initialized from override successfully');
    return true;
  } catch (overrideError) {
    const errMsg = (overrideError as Error)?.message || String(overrideError);
    logInit(`FATAL: override initialization failed: ${errMsg}`);

    // In Cloudflare Workers (non-Node), we cannot fall back to URL-based loading
    if (!isNodeEnvironment()) {
      throw new Error(
        `Shamir WASM override failed in Cloudflare Workers: ${errMsg}. ` +
        `URL-based fallback is not available. Please ensure shamir.moduleOrPath is correctly configured.`
      );
    }

    logInit('falling back to URL candidates (Node environment only)');
    return false;
  }
}

/**
 * Initialize WASM from URL candidates (Node.js filesystem or browser fetch)
 */
async function initWasmFromCandidateUrls(): Promise<void> {
  const candidates = getVrfWasmUrls();

  // Try filesystem first in Node.js
  if (isNodeEnvironment()) {
    logInit('attempting Node filesystem initialization for WASM');
    const initialized = await initWasmFromFilesystem(candidates);
    if (initialized) {
      logInit('initialized from Node filesystem');
      return;
    }
  }

  // Try URL-based loading (works in Node.js and browsers, NOT in Cloudflare Workers)
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      logInit(`trying URL candidate: ${candidate.toString()}`);
      await initWasm({ module_or_path: candidate as any });
      logInit('initialized from URL candidate');
      return;
    } catch (err) {
      lastError = err;
      logInit(`failed URL candidate: ${candidate.toString()} (${(err as Error)?.message || String(err)})`);
    }
  }

  throw lastError ?? new Error('Failed to initialize Shamir WASM from any candidate URL');
}

/**
 * Ensure Shamir WASM module is initialized
 *
 * Priority order:
 * 1. Explicit override (required for Cloudflare Workers)
 * 2. Node.js filesystem (development)
 * 3. URL-based loading (browsers, Node.js)
 */
async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  if (wasmInitPromise) {
    await wasmInitPromise;
    return;
  }

  wasmInitPromise = (async () => {
    // Try override first (required for Cloudflare Workers)
    const initializedFromOverride = await initWasmFromOverride();
    if (initializedFromOverride) {
      wasmInitialized = true;
      return;
    }

    // Warn if no override in non-Node environment (likely Cloudflare Workers)
    if (!isNodeEnvironment() && !wasmModuleOverride) {
      logInit('WARNING: No WASM module override set. This will likely fail in Cloudflare Workers. ' +
              'Please configure shamir.moduleOrPath in AuthService.');
    }

    // Fall back to URL-based loading
    await initWasmFromCandidateUrls();
    wasmInitialized = true;
  })();

  try {
    await wasmInitPromise;
  } finally {
    wasmInitPromise = null;
  }
}

export class Shamir3PassUtils {
  private p_b64u: string;
  private e_s_b64u: string;
  private d_s_b64u: string;

  constructor(opts: {
    p_b64u?: string;
    e_s_b64u?: string;
    d_s_b64u?: string;
  }) {
    this.p_b64u = opts.p_b64u ?? '';
    this.e_s_b64u = opts.e_s_b64u ?? '';
    this.d_s_b64u = opts.d_s_b64u ?? '';
  }

  getCurrentKeyId(): string | null {
    if (!this.e_s_b64u) return null;
    // Derive a stable identifier without Node crypto; use a simple hash
    try { return simpleHash32(this.e_s_b64u); } catch { return null; }
  }

  async initialize(): Promise<{ p_b64u: string }> {
    await ensureWasmInitialized();
    if (!this.p_b64u) {
      console.warn('No p_b64u provided, using default');
      let default_p_b64u = await getShamirPB64uFromWasm();
      this.p_b64u = default_p_b64u;
    }
    await configure_shamir_p(this.p_b64u);
    return {
      p_b64u: this.p_b64u
    };
  }

  async generateServerKeypair(): Promise<{ e_s_b64u: string; d_s_b64u: string }> {
    await ensureWasmInitialized();
    const msg: VRFWorkerMessage<Shamir3PassGenerateServerKeypairRequest> = {
      type: 'SHAMIR3PASS_GENERATE_SERVER_KEYPAIR',
      id: `srv_${Date.now()}`,
      payload: {},
    };
    const res = await wasmHandleMessage(msg);
    if (!res?.success) throw new Error(res?.error || 'generateServerKeypair failed');
    return {
      e_s_b64u: res.data.e_s_b64u,
      d_s_b64u: res.data.d_s_b64u
    };
  }

  async applyServerLock(req: ShamirApplyServerLockRequest): Promise<ShamirApplyServerLockResponse> {
    await ensureWasmInitialized();
    if (!this.e_s_b64u) {
      throw new Error('Server exponent e_s_b64u not configured');
    }
    const msg: VRFWorkerMessage<ShamirApplyServerLockRequest> = {
      type: 'SHAMIR3PASS_APPLY_SERVER_LOCK_KEK',
      id: `srv_${Date.now()}`,
      payload: {
        e_s_b64u: this.e_s_b64u,
        kek_c_b64u: req.kek_c_b64u
      },
    };
    const res = await wasmHandleMessage(msg);
    if (!res?.success) {
      throw new Error(res?.error || 'applyServerLock failed');
    }
    return {
      kek_cs_b64u: res.data.kek_cs_b64u,
      keyId: res.data.keyId,
    };
  }

  async removeServerLock(req: ShamirRemoveServerLockRequest): Promise<ShamirRemoveServerLockResponse> {
    await ensureWasmInitialized();
    if (!this.d_s_b64u) {
      throw new Error('Server exponent d_s_b64u not configured');
    }
    const msg: VRFWorkerMessage<ShamirRemoveServerLockRequest> = {
      type: 'SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK',
      id: `srv_${Date.now()}`,
      payload: {
        d_s_b64u: this.d_s_b64u,
        kek_cs_b64u: req.kek_cs_b64u
      },
    };
    const res = await wasmHandleMessage(msg);
    if (!res?.success) {
      throw new Error(res?.error || 'removeServerLock failed');
    }
    return {
      kek_c_b64u: res.data.kek_c_b64u,
    };
  }
}

// Public helper to read the compiled Shamir prime p from the WASM module
export async function getShamirPB64uFromWasm(): Promise<string> {
  await ensureWasmInitialized();
  return get_shamir_p_b64u();
}
