import {
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SecureConfirmDecision,
} from './confirmTxFlow/types';
import { handlePromptUserConfirmInJsMainThread } from './confirmTxFlow';
import type { VrfWorkerManagerContext } from '.';

/**
 * VRF-side helper to run confirmTxFlow directly from JS without going through a worker.
 * Useful while VRF-driven flows migrate off the signer worker.
 *
 * Returns the USER_PASSKEY_CONFIRM_RESPONSE data once the flow completes.
 */
export async function runSecureConfirm(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest
): Promise<SecureConfirmDecision> {
  return new Promise<SecureConfirmDecision>((resolve, reject) => {
    // Minimal Worker-like object to capture the response
    const worker = {
      postMessage: (msg: any) => {
        if (msg?.type === SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE) {
          resolve(msg.data as SecureConfirmDecision);
        }
      }
    } as unknown as Worker;

    handlePromptUserConfirmInJsMainThread(
      ctx,
      { type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD, data: request },
      worker
    ).catch(reject);
  });
}
