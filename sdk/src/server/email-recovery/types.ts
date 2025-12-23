import type { MinimalNearClient, SignedTransaction } from '../../core/NearClient';
import type { ActionArgsWasm } from '../../core/types/actions';
import type { ZkEmailProverClientOptions } from './zkEmail';
import type { Logger } from '../core/logger';

export interface EmailRecoveryServiceDeps {
  relayerAccountId: string;
  relayerPrivateKey: string;
  networkId: string;
  emailDkimVerifierContract: string;
  nearClient: MinimalNearClient;
  /**
   * Optional logger. When unset, EmailRecoveryService is silent (no `console.*`).
   * Pass `logger: console` to enable default logging.
   */
  logger?: Logger | null;
  ensureSignerAndRelayerAccount: () => Promise<void>;
  queueTransaction<T>(fn: () => Promise<T>, label: string): Promise<T>;
  fetchTxContext(accountId: string, publicKey: string): Promise<{ nextNonce: string; blockHash: string }>;
  signWithPrivateKey(input: {
    nearPrivateKey: string;
    signerAccountId: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    actions: ActionArgsWasm[];
  }): Promise<SignedTransaction>;
  getRelayerPublicKey(): string;
  zkEmailProver?: ZkEmailProverClientOptions;
}

export interface EmailRecoveryRequest {
  accountId: string;
  emailBlob: string;
}

export type EmailRecoveryMode = 'zk-email' | 'tee-encrypted' | 'onchain-public';

export interface EmailRecoveryDispatchRequest extends EmailRecoveryRequest {
  explicitMode?: string;
}

export interface EmailRecoveryResult {
  success: boolean;
  transactionHash?: string;
  message?: string;
  error?: string;
}
