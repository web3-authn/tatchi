// Server-side Shamir 3-pass exponent helpers.
// Implements modular exponentiation over a shared safe prime p.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// @ts-ignore - WASM imports
import initWasm, {
  handle_message as wasmHandleMessage,
  get_shamir_p_b64u,
  SHAMIR_P_B64U,
} from '../../wasm_vrf_worker/wasm_vrf_worker.js';

export { SHAMIR_P_B64U, get_shamir_p_b64u };


let wasmInitialized = false;
let wasmModule: any;

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const candidates = [
    join(__dirname, '../../wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
    join(__dirname, '../wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
    join(__dirname, '../../../src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
    join(__dirname, '../../../../src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
    join(__dirname, '../../../../../src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
    join(__dirname, '../../../../../../packages/passkey/src/wasm_vrf_worker/wasm_vrf_worker_bg.wasm'),
  ];
  let bytes: Buffer | undefined;
  for (const p of candidates) {
    try { bytes = readFileSync(p); break; } catch {}
  }
  if (!bytes) throw new Error('Could not find WASM file for Shamir3Pass');
  // Suppress wasm-bindgen deprecation warning by passing an options object
  wasmModule = await initWasm({ module_or_path: bytes });
  wasmInitialized = true;
}

export interface ApplyServerLockRequest {
  kek_c_b64u: string;
}

export interface ApplyServerLockResponse {
  kek_cs_b64u: string;
}

export interface RemoveServerLockRequest {
  kek_cs_b64u: string;
}

export interface RemoveServerLockResponse {
  kek_c_b64u: string;
}

export class Shamir3PassUtils {
  private p_b64u: string;
  private e_s_b64u: string;
  private d_s_b64u: string;

  constructor(opts: {
    p_b64u?: string;
    e_s_b64u?: string;
    d_s_b64u?: string
  }) {
    this.p_b64u = opts.p_b64u ?? '';
    this.e_s_b64u = opts.e_s_b64u ?? '';
    this.d_s_b64u = opts.d_s_b64u ?? '';
  }

  async generateServerKeypair(): Promise<{ e_s_b64u: string; d_s_b64u: string }> {
    await ensureWasmInitialized();
    const msg = {
      type: 'SHAMIR3PASS_GENERATE_SERVER_KEYPAIR',
      id: `srv_${Date.now()}`,
      data: { p_b64u: this.p_b64u },
    };
    const res = await wasmHandleMessage(msg);
    if (!res?.success) throw new Error(res?.error || 'generateServerKeypair failed');
    return { e_s_b64u: res.data.e_s_b64u, d_s_b64u: res.data.d_s_b64u };
  }

  async applyServerLock(req: ApplyServerLockRequest): Promise<ApplyServerLockResponse> {
    await ensureWasmInitialized();
    if (!this.e_s_b64u) {
      throw new Error('Server exponent e_s_b64u not configured');
    }
    const msg = {
      type: 'SHAMIR3PASS_APPLY_SERVER_LOCK_KEK',
      id: `srv_${Date.now()}`,
      data: {
        p_b64u: this.p_b64u,
        e_s_b64u: this.e_s_b64u,
        kek_c_b64u: req.kek_c_b64u
      },
    };
    const res = await wasmHandleMessage(msg);
    if (!res?.success) {
      throw new Error(res?.error || 'applyServerLock failed');
    }
    return {
      kek_cs_b64u: res.data.kek_cs_b64u
    };
  }

  async removeServerLock(req: RemoveServerLockRequest): Promise<RemoveServerLockResponse> {
    await ensureWasmInitialized();
    if (!this.d_s_b64u) {
      throw new Error('Server exponent d_s_b64u not configured');
    }
    const msg = {
      type: 'SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK',
      id: `srv_${Date.now()}`,
      data: {
        p_b64u: this.p_b64u,
        d_s_b64u: this.d_s_b64u,
        kek_cs_b64u: req.kek_cs_b64u
      },
    };
    const res = await wasmHandleMessage(msg);
    if (!res?.success) {
      throw new Error(res?.error || 'removeServerLock failed');
    }
    return { kek_c_b64u: res.data.kek_c_b64u };
  }
}

// Public helper to read the compiled Shamir prime p from the WASM module
export async function getShamirPB64uFromWasm(): Promise<string> {
  await ensureWasmInitialized();
  return get_shamir_p_b64u();
}

