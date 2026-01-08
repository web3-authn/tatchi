import type { FinalExecutionOutcome } from '@near-js/types';
import type { NearClient, SignedTransaction } from '../../core/NearClient';
import { ActionType, type ActionArgsWasm, validateActionArgsWasm } from '../../core/types/actions';
import type { SignedDelegate as CoreSignedDelegate } from '../../core/types/delegate';
import { isObject } from '@/utils/validation';

export interface DelegateActionPolicy {
  /** Optional allowlist of receiver account IDs. If empty/omitted, any receiver is allowed. */
  allowedReceivers?: string[];
  /** Optional allowlist of function call method names. Empty = any method. */
  allowedMethods?: string[];
  /**
   * Optional maximum total attached deposit (yoctoNEAR) across all actions.
   * Represented as decimal string to avoid BigInt JSON issues.
   */
  maxTotalDepositYocto?: string;
  /**
   * Optional custom predicate for additional checks.
   * Return false or throw to reject.
   */
  allow?: (input: {
    hash: string;
    delegate: CoreSignedDelegate['delegateAction'];
    signedDelegate: CoreSignedDelegate;
  }) => boolean | Promise<boolean>;
}

export interface ExecuteSignedDelegateRequest {
  hash: string;
  signedDelegate: CoreSignedDelegate;
  /**
   * Optional policy configuration. If omitted, only basic hash/signature/expiry checks
   * should be enforced by the caller.
   */
  policy?: DelegateActionPolicy;
}

export interface ExecuteSignedDelegateResult {
  ok: boolean;
  transactionHash?: string;
  outcome?: FinalExecutionOutcome;
  error?: string;
  code?: string;
}

/**
 * Normalize hash input (hex string with or without `0x` prefix) to a 32-byte Uint8Array.
 */
export function normalizeHashToBytes(hash: string): Uint8Array {
  const trimmed = (hash || '').trim().toLowerCase();
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (!hex || hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('invalid_hash_format');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const byte = hex.slice(i * 2, i * 2 + 2);
    bytes[i] = parseInt(byte, 16);
  }
  return bytes;
}

/**
 * Validate delegate nonce and expiry against current chain height.
 * The actual SignedDelegate hashing and signature verification is done in the signer worker;
 * this helper only enforces basic replay/expiry constraints expected of a relayer.
 */
export async function validateDelegateExpiryAndNonce(params: {
  nearClient: NearClient;
  signedDelegate: CoreSignedDelegate;
}): Promise<void> {
  const { nearClient, signedDelegate } = params;
  const delegate = signedDelegate?.delegateAction;
  if (!delegate) {
    throw new Error('invalid_delegate');
  }

  // Enforce max_block_height against current chain height
  const maxBlockHeight = BigInt(delegate.maxBlockHeight as any);
  // Allow maxBlockHeight <= 0 as "no expiry" for convenience/demo flows.
  // Relayers that require strict expiry should enforce a policy on top.
  if (maxBlockHeight <= 0n) {
    return;
  }

  const block = await nearClient.viewBlock({ finality: 'final' });
  const currentHeight = BigInt((block as any)?.header?.height ?? 0);
  if (currentHeight <= 0n) {
    throw new Error('invalid_block_height');
  }

  if (currentHeight > maxBlockHeight) {
    throw new Error('delegate_expired');
  }

  // NOTE: Nonce / replay protection is left to the integrator for now.
  // Implementations are expected to maintain per-publicKey/receiver nonce state
  // (e.g. in a database or KV store) and reject duplicates or out-of-order nonces.
}

/**
 * Enforce a simple policy over the delegate action:
 * - Receiver allowlist
 * - FunctionCall method allowlist
 * - Total attached deposit limit
 */
export async function enforceDelegatePolicy(input: {
  hash: string;
  signedDelegate: CoreSignedDelegate;
  policy?: DelegateActionPolicy;
}): Promise<void> {
  const { hash, signedDelegate, policy } = input;
  if (!policy) return;

  const delegate = signedDelegate?.delegateAction;
  if (!delegate) {
    throw new Error('invalid_delegate');
  }

  const receiverId = String(delegate.receiverId || '');

  if (policy.allowedReceivers && policy.allowedReceivers.length > 0) {
    if (!policy.allowedReceivers.includes(receiverId)) {
      throw Object.assign(new Error('receiver_not_allowed'), { code: 'receiver_not_allowed' });
    }
  }

  // Compute total deposit and check method allowlist
  let totalDeposit = 0n;
  const actions = delegate.actions || [];
  for (const action of actions as any[]) {
    if (!isObject(action) || !('type' in action)) continue;
    const kind = (action as any).type;

    if (kind === ActionType.FunctionCall) {
      const methodName = String((action as any).methodName || '');
      if (policy.allowedMethods && policy.allowedMethods.length > 0) {
        if (!policy.allowedMethods.includes(methodName)) {
          throw Object.assign(new Error('method_not_allowed'), { code: 'method_not_allowed' });
        }
      }
      const deposit = BigInt(String((action as any).deposit || '0'));
      totalDeposit += deposit;
    } else if (kind === ActionType.Transfer) {
      const amount = BigInt(String((action as any).amount || '0'));
      totalDeposit += amount;
    }
  }

  if (policy.maxTotalDepositYocto) {
    const limit = BigInt(policy.maxTotalDepositYocto);
    if (totalDeposit > limit) {
      throw Object.assign(new Error('deposit_exceeds_limit'), {
        code: 'deposit_exceeds_limit',
      });
    }
  }

  if (policy.allow) {
    const ok = await policy.allow({ hash, delegate, signedDelegate });
    if (!ok) {
      throw Object.assign(new Error('delegate_rejected'), { code: 'delegate_rejected' });
    }
  }
}

/**
 * Build a relayer transaction that wraps the SignedDelegate in a NEP-461
 * SignedDelegate action. The relayer account is the signer and receiver.
 *
 * This helper only builds and sends the outer transaction; it assumes that:
 * - hash/signature/expiry checks have already been performed, and
 * - nonce/replay protection is implemented by the caller if needed.
 */
export async function executeSignedDelegateWithRelayer(params: {
  nearClient: NearClient;
  relayerAccountId: string;
  relayerPublicKey: string;
  relayerPrivateKey: string;
  hash: string;
  signedDelegate: CoreSignedDelegate;
  signWithPrivateKey: (input: {
    nearPrivateKey: string;
    signerAccountId: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    actions: ActionArgsWasm[];
  }) => Promise<SignedTransaction>;
}): Promise<ExecuteSignedDelegateResult> {
  const {
    nearClient,
    relayerAccountId,
    relayerPublicKey,
    relayerPrivateKey,
    hash,
    signedDelegate,
    signWithPrivateKey,
  } = params;

  try {
    // Basic expiry check (max_block_height) before submitting
    await validateDelegateExpiryAndNonce({ nearClient, signedDelegate });

    // Normalize delegateAction shape for the signer worker.
    // Browser SDK currently returns a WasmSignedDelegate where
    // delegateAction.actionsJson is a JSON string of Vec<Action>.
    // The signer expects DelegateAction { actions: Vec<Action> }.
    const rawDelegate: any = signedDelegate?.delegateAction;
    if (!rawDelegate) {
      throw new Error('invalid_delegate_action');
    }

    let delegateForWorker = rawDelegate;
    if (rawDelegate && !('actions' in rawDelegate) && 'actionsJson' in rawDelegate) {
      let parsedActions: any[] = [];
      try {
        parsedActions = rawDelegate.actionsJson
          ? JSON.parse(String(rawDelegate.actionsJson))
          : [];
      } catch (err) {
        const error = new Error('delegate_actions_parse_failed');
        (error as any).cause = err;
        throw error;
      }

      delegateForWorker = {
        // senderId = user (the account whose access key authorizes the action)
        senderId: rawDelegate.senderId,
        // receiverId = target contract/account (the intended recipient of the inner actions)
        receiverId: rawDelegate.receiverId,
        actions: parsedActions,
        nonce: rawDelegate.nonce,
        maxBlockHeight: rawDelegate.maxBlockHeight,
        publicKey: rawDelegate.publicKey,
      };
    }

    // Build SignedDelegate action payload for the signer worker.
    const actions: ActionArgsWasm[] = [
      {
        action_type: ActionType.SignedDelegate,
        // Pass through the fully-typed delegate payload; the signer WASM maps this
        // into the on-chain SignedDelegateAction inside Action::Delegate.
        delegate_action: delegateForWorker,
        signature: signedDelegate.signature,
      },
    ];

    actions.forEach(validateActionArgsWasm);

    // Fetch nonce + block hash for the *relayer* account.
    // This section builds the outer transaction that the relayer signs and
    // submits to NEAR. The nonce here is the relayer access key nonce and is
    // completely separate from the delegate_action.nonce inside SignedDelegate.
    const block = await nearClient.viewBlock({ finality: 'final' });
    const blockHash = String((block as any)?.header?.hash || '');
    if (!blockHash) {
      throw new Error('missing_block_hash');
    }

    // Use viewAccessKey to derive next nonce for relayer
    let nonce = 0n;
    try {
      const ak = await nearClient.viewAccessKey(relayerAccountId, relayerPublicKey);
      nonce = BigInt(ak?.nonce ?? 0);
    } catch {
      nonce = 0n;
    }
    const nextNonce = (nonce + 1n).toString();

    // The outer transaction must target the delegate sender account so that
    // on-chain DelegateAction processing sees `sender_id` == tx.receiver.
    // The relayer still pays for gas (as the transaction signer), but the
    // receiver is the wallet user's account that owns the access key used
    // to validate delegate_action.nonce and delegate_action.public_key.
    const delegateSenderId = String(
      delegateForWorker?.senderId ||
      signedDelegate?.delegateAction?.senderId || ''
    ).trim();

    if (!delegateSenderId) {
      throw new Error('missing_delegate_sender_id');
    }

    const signedTx = await signWithPrivateKey({
      nearPrivateKey: relayerPrivateKey,
      signerAccountId: relayerAccountId,
      receiverId: delegateSenderId,
      nonce: nextNonce,
      blockHash,
      actions,
    });

    const outcome = await nearClient.sendTransaction(signedTx);

    const txHash = outcome?.transaction?.hash || null;

    return {
      ok: true,
      transactionHash: txHash || undefined,
      outcome,
    };
  } catch (error: any) {
    const code = error?.code || 'delegate_execution_failed';
    const message = error?.message || String(error);
    return {
      ok: false,
      error: message,
      code,
    };
  }
}
