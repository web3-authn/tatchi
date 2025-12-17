/**
 * Control messages exchanged between worker shims and the main thread.
 *
 * These messages are JS-only and do NOT go through the Rust WASM JSON request/response pipeline.
 * They are used for:
 * - MessagePort attachment handshakes (WrapKeySeed delivery)
 * - Readiness signals (worker pool health checks)
 */
export const WorkerControlMessage = {
  ATTACH_WRAP_KEY_SEED_PORT: 'ATTACH_WRAP_KEY_SEED_PORT',
  ATTACH_WRAP_KEY_SEED_PORT_OK: 'ATTACH_WRAP_KEY_SEED_PORT_OK',
  ATTACH_WRAP_KEY_SEED_PORT_ERROR: 'ATTACH_WRAP_KEY_SEED_PORT_ERROR',
  WORKER_READY: 'WORKER_READY',
} as const;

export type WorkerControlMessageType =
  (typeof WorkerControlMessage)[keyof typeof WorkerControlMessage];
