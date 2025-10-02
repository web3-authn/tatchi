/**
 * Re-export VRF (Shamir) WASM module for Cloudflare Workers
 *
 * This module provides a clean import path for WASM modules.
 * In production builds, bundlers will resolve this to the actual WASM file.
 */
export { default } from '../../wasm_vrf_worker/pkg/wasm_vrf_worker_bg.wasm';

