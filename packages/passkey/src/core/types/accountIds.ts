
/**
 * Type-safe account ID system for NEAR account operations
 *
 * USAGE:
 * - AccountId: Use for all operations - on-chain, PRF salt derivation, VRF operations, storage, WebAuthn
 *
 * EXAMPLES:
 * - "serp126.web3-authn-v4.testnet"
 * - "alice.near"
 * - "simple.testnet"
 */

import { validateNearAccountId } from '../../utils/validation';

// Branded string type for compile-time type safety
export type AccountId = string & { readonly __brand: 'AccountId' };

/**
 * Convert and validate string to AccountId
 * Validates proper NEAR account format (must contain at least one dot)
 */
export function toAccountId(accountId: string): AccountId {
  const validation = validateNearAccountId(accountId);
  if (!validation.valid) {
    throw new Error(`Invalid NEAR account ID: ${accountId}`);
  }
  return accountId as AccountId;
}

/**
 * Account ID utilities
 */
export const AccountId = {
  validate: validateNearAccountId,
  to: toAccountId,
} as const;
