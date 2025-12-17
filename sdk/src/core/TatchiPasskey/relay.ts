import { ActionPhase, ActionStatus, type ActionSSEEvent, type DelegateRelayHooksOptions } from '../types/sdkSentEvents';
import type { DelegateRelayResult } from '../types/tatchi';
import type { SignedDelegate } from '../types/delegate';

export interface RelayDelegateRequest {
  hash: string;
  signedDelegate: SignedDelegate;
}

export async function sendDelegateActionViaRelayer(args: {
  url: string;
  payload: RelayDelegateRequest;
  signal?: AbortSignal;
  options?: DelegateRelayHooksOptions;
}): Promise<DelegateRelayResult> {

  const { url, payload, signal, options } = args;

  const emit = (event: ActionSSEEvent) => options?.onEvent?.(event);
  const emitError = (message: string) => {
    emit({
      step: 0,
      phase: ActionPhase.ACTION_ERROR,
      status: ActionStatus.ERROR,
      message,
      error: message,
    });
  };

  emit({
    step: 7,
    phase: ActionPhase.STEP_7_BROADCASTING,
    status: ActionStatus.PROGRESS,
    message: 'Submitting delegate to relayer...',
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    options?.onError?.(error);
    emitError(error.message);
    await options?.afterCall?.(false);
    throw error;
  }

  if (!res.ok) {
    const response: DelegateRelayResult = {
      ok: false,
      error: `Relayer HTTP ${res.status}`,
    };
    options?.onError?.(new Error(response.error));
    emitError(response.error!);
    await options?.afterCall?.(false);
    return response;
  }

  let json: any;
  try {
    json = await res.json();
  } catch (err: unknown) {
    const response: DelegateRelayResult = {
      ok: false,
      error: 'Relayer returned non-JSON response',
    };
    const error = err instanceof Error ? err : new Error(String(err));
    options?.onError?.(error);
    emitError(response.error!);
    await options?.afterCall?.(false);
    return response;
  }

  const response: DelegateRelayResult = {
    ok: Boolean(json?.ok ?? true),
    relayerTxHash: json?.relayerTxHash ?? json?.transactionId ?? json?.txHash,
    status: json?.status,
    outcome: json?.outcome,
    error: json?.error,
  };

  const success = response.ok !== false;
  if (success) {
    emit({
      step: 8,
      phase: ActionPhase.STEP_8_ACTION_COMPLETE,
      status: ActionStatus.SUCCESS,
      message: 'Delegate relayed successfully',
    });
    await options?.afterCall?.(true, response);
  } else {
    const message = response.error || 'Relayer execution failed';
    options?.onError?.(new Error(message));
    emitError(message);
    await options?.afterCall?.(false);
  }

  return response;
}
