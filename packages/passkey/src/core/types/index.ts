import type { PasskeyErrorDetails } from './errors';

/**
 * Generic Result type for better error handling throughout the SDK
 */
export type Result<T, E = PasskeyErrorDetails> =
  | { success: true; data: T }
  | { success: false; error: E };

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