import type { PasskeyErrorDetails } from './errors';

/**
 * Generic Result type for better error handling throughout the SDK
 */
export type Result<T, E = PasskeyErrorDetails> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * WASM Bindgen generates a `free` method on all structs.
 * This type removes the `free` method from the struct.
 */
export type StripFree<T> = T extends object
  ? { [K in keyof T as K extends 'free' ? never : K]: StripFree<T[K]> }
  : T;

// Export all types
export * from './rpc'
export * from './signer-worker'
export * from './vrf-worker'
export * from './webauthn'
export * from './errors'
export * from './linkDevice'
export * from './accountIds'
export * from './passkeyManager'

export type { ClientUserData } from '../IndexedDBManager/passkeyClientDB';