import type { PasskeyErrorDetails } from './errors';

/**
 * Generic Result type for better error handling throughout the SDK
 */
export type Result<T, E = PasskeyErrorDetails> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * WASM Bindgen generates a `free` method and a `[Symbol.dispose]` method on all structs.
 * This helper strips those so we can use plain object shapes for worker payloads.
 */
export type StripFree<T> = T extends object
  ? { [K in keyof T as K extends 'free' | symbol ? never : K]: StripFree<T[K]> }
  : T;

// Export all types
export * from './actions'
export * from './rpc'
export * from './signer-worker'
export * from './vrf-worker'
export * from './webauthn'
export * from './errors'
export * from './linkDevice'
export * from './accountIds'
export * from './passkeyManager'
export * from './delegate'

export type { ClientUserData } from '../IndexedDBManager/passkeyClientDB';
