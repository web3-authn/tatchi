import type { ActionArgs } from './actions';

export interface PublicKey {
  keyType: number;
  keyData: number[];
}

export interface Signature {
  keyType: number;
  signatureData: number[];
}

export interface DelegateAction {
  senderId: string;
  receiverId: string;
  actions: ActionArgs[];
  nonce: bigint | string | number;
  maxBlockHeight: bigint | string | number;
  publicKey: PublicKey;
}

export interface SignedDelegate {
  delegateAction: DelegateAction;
  signature: Signature;
}

export interface DelegateActionInput {
  /** Account that authorizes the delegate action (the wallet user). */
  senderId: string;
  /** Contract that will ultimately execute the delegated actions. */
  receiverId: string;
  /** NEAR actions to execute once the delegate is wrapped and sent on-chain. */
  actions: ActionArgs[];
  /**
   * Per-sender nonce to prevent replay. Should come from the delegator’s
   * access key context, not the relayer.
   */
  nonce: bigint | string | number;
  /**
   * Block height expiry for the delegate (the relayer must submit before this).
   */
  maxBlockHeight: bigint | string | number;
  /**
   * Public key of the signer used to sign the delegate action.
   * - `local-signer`: the local device key
   * - `threshold-signer`: the threshold/group key
   *
   * Must match the key used to produce the delegate signature.
   */
  publicKey: string | PublicKey;
}
