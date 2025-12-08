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
  type ShamirWasmModuleSupplier,
} from './types.js';
import { createWasmLoader, isNodeEnvironment } from './wasm-loader.js';

export { SHAMIR_P_B64U, get_shamir_p_b64u };

let wasmInitialized = false;
let wasmModuleOverride: ShamirWasmModuleSupplier | null = null;
let wasmInitPromise: Promise<void> | null = null;

export function setShamirWasmModuleOverride(
  supplier: ShamirWasmModuleSupplier | null
): void {
  wasmModuleOverride = supplier;
  wasmInitialized = false;
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
  // Only construct filesystem/URL fallbacks in Node.js.
  // Cloudflare Workers cannot safely use import.meta.url as a base URL.
  if (!isNodeEnvironment()) {
    return [];
  }

  try {
    return [
      new URL(VRF_WASM_MAIN_PATH, import.meta.url),
      new URL(VRF_WASM_FALLBACK_PATH, import.meta.url),
    ];
  } catch (err) {
    console.warn(
      '[ShamirWasmInit] Failed to construct VRF WASM URLs from import.meta.url:',
      (err as Error)?.message || err
    );
    return [];
  }
}

const vrfWasmLoader = createWasmLoader(initWasm, {
  logPrefix: 'ShamirWasmInit',
  baseUrl: import.meta.url,
  fallbackUrls: getVrfWasmUrls(),
});

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
    await vrfWasmLoader.load(wasmModuleOverride ?? undefined);
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
