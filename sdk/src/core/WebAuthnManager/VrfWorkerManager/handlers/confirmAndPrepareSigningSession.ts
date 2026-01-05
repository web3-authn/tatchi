import type { TransactionInputWasm } from '../../../types/actions';
import { ActionType } from '../../../types/actions';
import type { RpcCallPayload, ConfirmationConfig } from '../../../types/signer-worker';
import type { TransactionContext } from '../../../types/rpc';
import { computeUiIntentDigestFromTxs, orderActionForDigest } from '../../../digests/intentDigest';
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
import type { VRFChallenge, VRFWorkerMessage, WasmConfirmAndPrepareSigningSessionRequest } from '../../../types/vrf-worker';

export interface ConfirmAndPrepareSigningSessionBaseParams {
  ctx: VrfWorkerManagerContext;
  sessionId: string;
  confirmationConfigOverride?: Partial<ConfirmationConfig>;
}

export interface ConfirmAndPrepareSigningSessionTransactionParams extends ConfirmAndPrepareSigningSessionBaseParams {
  kind: 'transaction';
  txSigningRequests: TransactionInputWasm[];
  rpcCall: RpcCallPayload;
  title?: string;
  body?: string;
}

export interface ConfirmAndPrepareSigningSessionDelegateParams extends ConfirmAndPrepareSigningSessionBaseParams {
  kind: 'delegate';
  nearAccountId: string;
  title?: string;
  body?: string;
  delegate: {
    senderId: string;
    receiverId: string;
    actions: TransactionInputWasm['actions'];
    nonce: string | number | bigint;
    maxBlockHeight: string | number | bigint;
  };
  rpcCall: RpcCallPayload;
}

export interface ConfirmAndPrepareSigningSessionNep413Params extends ConfirmAndPrepareSigningSessionBaseParams {
  kind: 'nep413';
  nearAccountId: string;
  message: string;
  recipient: string;
  title?: string;
  body?: string;
  contractId?: string;
  nearRpcUrl?: string;
}

export type ConfirmAndPrepareSigningSessionParams =
  | ConfirmAndPrepareSigningSessionTransactionParams
  | ConfirmAndPrepareSigningSessionDelegateParams
  | ConfirmAndPrepareSigningSessionNep413Params;

export interface ConfirmAndPrepareSigningSessionResult {
  sessionId: string;
  transactionContext: TransactionContext;
  intentDigest: string;
  credential?: SerializableCredential;
  vrfChallenge?: VRFChallenge;
}

/**
 * Kick off the SecureConfirm signing flow inside the VRF worker.
 *
 * This creates a schemaVersion=2 `SecureConfirmRequest` (tx / delegate / NEP-413) and sends it to the
 * VRF worker, which will render UI, collect a WebAuthn credential when needed, and return the
 * `transactionContext` (reserved nonces, block hash/height) needed by the signer worker.
 */
export async function confirmAndPrepareSigningSession(
  handlerCtx: VrfWorkerManagerHandlerContext,
  params: ConfirmAndPrepareSigningSessionParams
): Promise<ConfirmAndPrepareSigningSessionResult> {
  const { sessionId } = params;

  let intentDigest: string;
  let request: SecureConfirmRequest<SignTransactionPayload | SignNep413Payload, TransactionSummary>;

  switch (params.kind) {
    case 'transaction': {
      const txSigningRequests = params.txSigningRequests;
      intentDigest = await computeUiIntentDigestFromTxs(
        txSigningRequests.map(tx => ({
          receiverId: tx.receiverId,
          actions: tx.actions.map(orderActionForDigest),
        })) as TransactionInputWasm[]
      );

      const summary: TransactionSummary = {
        intentDigest,
        receiverId: txSigningRequests[0]?.receiverId,
        totalAmount: computeTotalAmountYocto(txSigningRequests),
        type: 'transaction',
        ...(params.title != null ? { title: params.title } : {}),
        ...(params.body != null ? { body: params.body } : {}),
      };

      request = {
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
      };
      break;
    }
    case 'delegate': {
      const txSigningRequests: TransactionInputWasm[] = [{
        receiverId: params.delegate.receiverId,
        actions: params.delegate.actions,
      } as TransactionInputWasm];

      intentDigest = await computeUiIntentDigestFromTxs(
        txSigningRequests.map(tx => ({
          receiverId: tx.receiverId,
          actions: tx.actions.map(orderActionForDigest),
        })) as TransactionInputWasm[]
      );

      const summary: TransactionSummary = {
        intentDigest,
        receiverId: txSigningRequests[0]?.receiverId,
        totalAmount: computeTotalAmountYocto(txSigningRequests),
        type: 'delegateAction',
        ...(params.title != null ? { title: params.title } : {}),
        ...(params.body != null ? { body: params.body } : {}),
        delegate: {
          senderId: params.delegate.senderId,
          receiverId: params.delegate.receiverId,
          nonce: String(params.delegate.nonce),
          maxBlockHeight: String(params.delegate.maxBlockHeight),
        },
      };

      request = {
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
      };
      break;
    }
    case 'nep413': {
      intentDigest = `${params.nearAccountId}:${params.recipient}:${params.message}`;
      const summary: TransactionSummary = {
        intentDigest,
        method: 'NEP-413',
        receiverId: params.recipient,
        ...(params.title != null ? { title: params.title } : {}),
        ...(params.body != null ? { body: params.body } : {}),
      };

      request = {
        schemaVersion: 2,
        requestId: sessionId,
        type: SecureConfirmationType.SIGN_NEP413_MESSAGE,
        summary,
        payload: {
          nearAccountId: params.nearAccountId,
          message: params.message,
          recipient: params.recipient,
          ...(params.contractId ? { contractId: params.contractId } : {}),
          ...(params.nearRpcUrl ? { nearRpcUrl: params.nearRpcUrl } : {}),
        },
        confirmationConfig: params.confirmationConfigOverride,
        intentDigest,
      };
      break;
    }
    default: {
      // Exhaustiveness guard
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = params;
      throw new Error('Unsupported signing session kind');
    }
  }

  await handlerCtx.ensureWorkerReady(true);
  const message: VRFWorkerMessage<WasmConfirmAndPrepareSigningSessionRequest> = {
    type: 'CONFIRM_AND_PREPARE_SIGNING_SESSION',
    id: handlerCtx.generateMessageId(),
    payload: {
      request,
    },
  };
  const response = await handlerCtx.sendMessage<WasmConfirmAndPrepareSigningSessionRequest>(message);
  if (!response.success) {
    throw new Error(`confirmAndPrepareSigningSession failed: ${response.error}`);
  }

  const decision = response.data as {
    confirmed?: boolean;
    error?: string;
    intent_digest?: string;
    transaction_context?: TransactionContext;
    credential?: SerializableCredential;
    vrf_challenge?: VRFChallenge;
  };

  if (!decision?.confirmed) {
    throw new Error(decision?.error || 'User rejected signing request');
  }
  if (!decision.transaction_context) {
    throw new Error('Missing transactionContext from confirmation flow');
  }

  return {
    sessionId,
    transactionContext: decision.transaction_context,
    intentDigest: decision.intent_digest || intentDigest,
    credential: decision.credential,
    vrfChallenge: decision.vrf_challenge,
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
