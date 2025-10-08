/**
 * Re-export signer WASM module for Cloudflare Workers
 *
 * This module provides a clean import path for WASM modules.
 * In production builds, bundlers will resolve this to the actual WASM file.
 */
export { default } from '../../wasm_signer_worker/pkg/wasm_signer_worker_bg.wasm';

