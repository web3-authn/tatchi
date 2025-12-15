import type { TransactionInputWasm } from '../../../types/actions';
import { ActionType } from '../../../types/actions';
import type { RpcCallPayload, ConfirmationConfig } from '../../../types/signer-worker';
import type { TransactionContext } from '../../../types/rpc';
import type { VRFChallenge } from '../../../types/vrf-worker';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../../txDigest';
import { runSecureConfirm } from '../secureConfirmBridge';
import {
  SecureConfirmationType,
  type SecureConfirmRequest,
  type SignTransactionPayload,
  type TransactionSummary,
  type SerializableCredential,
} from '../confirmTxFlow/types';
import type { SignNep413Payload } from '../confirmTxFlow/types';
import type { VrfWorkerManagerContext } from '..';
import type { VrfWorkerManagerHandlerContext } from './types';

export async function confirmAndPrepareSigningSession(
  _handlerCtx: VrfWorkerManagerHandlerContext,
  params: {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'transaction';
    txSigningRequests: TransactionInputWasm[];
    rpcCall: RpcCallPayload;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  } | {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'delegate';
    nearAccountId: string;
    delegate: {
      senderId: string;
      receiverId: string;
      actions: TransactionInputWasm['actions'];
      nonce: string | number | bigint;
      maxBlockHeight: string | number | bigint;
    };
    rpcCall: RpcCallPayload;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  } | {
    ctx: VrfWorkerManagerContext;
    sessionId: string;
    kind: 'nep413';
    nearAccountId: string;
    message: string;
    recipient: string;
    confirmationConfigOverride?: Partial<ConfirmationConfig>;
  }
): Promise<{
  sessionId: string;
  wrapKeySalt: string;
  vrfChallenge: VRFChallenge;
  transactionContext: TransactionContext;
  intentDigest: string;
  credential: SerializableCredential;
}> {
  const { ctx, sessionId } = params;

  // Canonical intent digest for transactions: hash only receiverId + ordered actions,
  // excluding nonce and other per-tx metadata, to stay in sync with UI confirmers.
  const txSigningRequests = params.kind === 'delegate'
    ? [{
        receiverId: params.delegate.receiverId,
        actions: params.delegate.actions,
      } as TransactionInputWasm]
    : params.kind === 'transaction'
      ? params.txSigningRequests
      : [];

  const intentDigest = params.kind !== 'nep413'
    ? await computeUiIntentDigestFromTxs(
        txSigningRequests.map(tx => ({
          receiverId: tx.receiverId,
          actions: tx.actions.map(orderActionForDigest),
        })) as TransactionInputWasm[]
      )
    : `${params.nearAccountId}:${params.recipient}:${params.message}`;

  const summary: TransactionSummary = params.kind !== 'nep413'
    ? {
        intentDigest,
        receiverId: txSigningRequests[0]?.receiverId,
        totalAmount: computeTotalAmountYocto(txSigningRequests),
        type: params.kind === 'delegate' ? 'delegateAction' : 'transaction',
        delegate: params.kind === 'delegate'
          ? {
              senderId: params.nearAccountId,
              receiverId: params.delegate.receiverId,
              nonce: String(params.delegate.nonce),
              maxBlockHeight: String(params.delegate.maxBlockHeight),
            }
          : undefined,
      }
    : {
        intentDigest,
        method: 'NEP-413',
        receiverId: params.recipient,
      };

  const request: SecureConfirmRequest<SignTransactionPayload | SignNep413Payload, TransactionSummary> =
    params.kind !== 'nep413'
      ? {
          schemaVersion: 2,
          requestId: sessionId,
          type: SecureConfirmationType.SIGN_TRANSACTION,
          summary,
          payload: {
            txSigningRequests,
            intentDigest,
            rpcCall: params.rpcCall,
          },
          confirmationConfig: params.confirmationConfigOverride,
          intentDigest,
        }
      : {
          schemaVersion: 2,
          requestId: sessionId,
          type: SecureConfirmationType.SIGN_NEP413_MESSAGE,
          summary,
          payload: {
            nearAccountId: params.nearAccountId,
            message: params.message,
            recipient: params.recipient,
          },
          confirmationConfig: params.confirmationConfigOverride,
          intentDigest,
        };

  const decision = await runSecureConfirm(ctx, request);
  if (!decision.confirmed) {
    throw new Error(decision.error || 'User rejected signing request');
  }
  if (!decision.credential) {
    throw new Error('Missing credential from confirmation flow');
  }
  if (!decision.vrfChallenge) {
    throw new Error('Missing vrfChallenge from confirmation flow');
  }
  if (!decision.transactionContext) {
    throw new Error('Missing transactionContext from confirmation flow');
  }
  const wrapKeySalt = decision.wrapKeySalt || '';

  return {
    sessionId,
    wrapKeySalt,
    vrfChallenge: decision.vrfChallenge,
    transactionContext: decision.transactionContext,
    intentDigest: decision.intentDigest || intentDigest,
    credential: decision.credential,
  };
}

function computeTotalAmountYocto(txSigningRequests: TransactionInputWasm[]): string | undefined {
  try {
    let total = BigInt(0);
    for (const tx of txSigningRequests) {
      for (const action of tx.actions) {
        switch (action.action_type) {
          case ActionType.Transfer:
            total += BigInt(action.deposit || '0');
            break;
          case ActionType.FunctionCall:
            total += BigInt(action.deposit || '0');
            break;
          case ActionType.Stake:
            total += BigInt(action.stake || '0');
            break;
          default:
            break;
        }
      }
    }
    return total > BigInt(0) ? total.toString() : undefined;
  } catch {
    return undefined;
  }
}

