import type { PasskeyManagerContext } from './index';
import type { DelegateActionInput } from '../types/delegate';
import type { ActionSSEEvent, AfterCall, EventCallback } from '../types/passkeyManager';
import type { AccountId } from '../types/accountIds';
import { ActionPhase, ActionStatus } from '../types/passkeyManager';
import { toAccountId } from '../types/accountIds';
import { toError } from '../../utils/errors';
import type { ConfirmationConfig } from '../types/signer-worker';

export interface DelegateActionHooksOptions {
  onEvent?: EventCallback<ActionSSEEvent>;
  onError?: (error: Error) => void;
  afterCall?: AfterCall<SignDelegateActionResult>;
  confirmationConfig?: Partial<ConfirmationConfig>;
}

export interface SignDelegateActionResult {
  hash: string;
  signedDelegate: import('../types/signer-worker').WasmSignedDelegate;
  nearAccountId: string;
  logs?: string[];
}

export async function signDelegateAction(args: {
  context: PasskeyManagerContext;
  nearAccountId: AccountId;
  delegate: DelegateActionInput;
  options?: DelegateActionHooksOptions;
}): Promise<SignDelegateActionResult> {
  const { context, delegate, options } = args;
  const nearAccountId = toAccountId(String(args.nearAccountId));

  const resolvedDelegate: DelegateActionInput = {
    ...delegate,
    senderId: delegate.senderId || String(nearAccountId),
  };

  options?.onEvent?.({
    step: 1,
    phase: ActionPhase.STEP_1_PREPARATION,
    status: ActionStatus.PROGRESS,
    message: 'Preparing delegate action inputs',
  });

  // Emit a user-confirmation phase before kicking off the VRF-driven
  // confirmation flow so the wallet-iframe overlay can expand and allow
  // the TxConfirmer modal to capture activation.
  options?.onEvent?.({
    step: 2,
    phase: ActionPhase.STEP_2_USER_CONFIRMATION,
    status: ActionStatus.PROGRESS,
    message: 'Requesting delegate action confirmation…',
  });

  try {
    const coreResult = await context.webAuthnManager.signDelegateAction({
      delegate: resolvedDelegate,
      rpcCall: {
        contractId: context.configs.contractId,
        nearRpcUrl: context.configs.nearRpcUrl,
        nearAccountId: String(nearAccountId),
      },
      confirmationConfigOverride: options?.confirmationConfig,
      onEvent: options?.onEvent
        ? (ev) => options.onEvent?.(ev as unknown as ActionSSEEvent)
        : undefined,
    });

    const result: SignDelegateActionResult = {
      hash: coreResult.hash,
      signedDelegate: coreResult.signedDelegate,
      nearAccountId: String(nearAccountId),
      logs: coreResult.logs,
    };

    options?.onEvent?.({
      step: 9,
      phase: ActionPhase.STEP_9_ACTION_COMPLETE,
      status: ActionStatus.SUCCESS,
      message: 'Delegate action signed',
      data: { hash: result.hash },
    });

    await options?.afterCall?.(true, result);

    return result;
  } catch (error: unknown) {
    const e = toError(error);
    options?.onError?.(e);
    options?.afterCall?.(false);
    options?.onEvent?.({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message: e.message,
      error: e.message,
    });
    throw e;
  }
}
