import { IndexedDBManager } from '../IndexedDBManager';
import { toAccountId, type AccountId } from '../types/accountIds';
import type { DerivedAddressRecord } from '../IndexedDBManager';

/**
 * DerivedAddressManager
 *
 * Encapsulates storage and retrieval of multi-chain derived addresses
 * for a given NEAR account. Uses the IndexedDB client DB under the hood
 * and supports path-encoded namespaces (e.g., `evm:<chainId>:<path>`).
 */
export class ChainsigAddressManager {
  async setDerivedAddress(
    nearAccountId: string | AccountId,
    args: { contractId: string; path: string; address: string }
  ): Promise<void> {
    await IndexedDBManager.clientDB.setDerivedAddress(toAccountId(nearAccountId as string), args);
  }

  async getDerivedAddressRecord(
    nearAccountId: string | AccountId,
    args: { contractId: string; path: string }
  ): Promise<DerivedAddressRecord | null> {
    return await IndexedDBManager.clientDB.getDerivedAddressRecord(toAccountId(nearAccountId as string), args);
  }

  async getDerivedAddress(
    nearAccountId: string | AccountId,
    args: { contractId: string; path: string }
  ): Promise<string | null> {
    return await IndexedDBManager.clientDB.getDerivedAddress(toAccountId(nearAccountId as string), args);
  }
}

export const chainsigAddressManager = new ChainsigAddressManager();
