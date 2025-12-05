import {
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SecureConfirmDecision,
} from './confirmTxFlow/types';
import { handlePromptUserConfirmInJsMainThread } from './confirmTxFlow';
import type { NearClient } from '../../NearClient';
import type { UnifiedIndexedDBManager } from '../../IndexedDBManager';
import type { TouchIdPrompt } from '../touchIdPrompt';
import type { VrfWorkerManager } from '.';
import type { UserPreferencesManager } from '../userPreferences';
import type { NonceManager } from '../../nonceManager';
import type { WorkerRequestTypeMap, WorkerResponseForRequest } from '../../types/signer-worker';
import type { onProgressEvents } from '../../types/passkeyManager';

/**
 * Shared host context for confirmTxFlow.
 *
 * The base context carries the fields used by confirmTxFlow (UI, NEAR, IndexedDB,
 * user preferences, NonceManager, and the sendMessage bridge). Concrete hosts
 * (VRF manager vs signer manager) extend this base with their own fields.
 */
export interface VrfWorkerManagerContext {
  touchIdPrompt: TouchIdPrompt;
  nearClient: NearClient;
  indexedDB: UnifiedIndexedDBManager;
  userPreferencesManager: UserPreferencesManager;
  nonceManager: NonceManager;
  rpIdOverride?: string;
  nearExplorerUrl?: string;
  vrfWorkerManager?: VrfWorkerManager;
  sendMessage: <T extends keyof WorkerRequestTypeMap>(args: {
    message: {
      type: T;
      payload: WorkerRequestTypeMap[T]['request'];
    };
    onEvent?: (update: onProgressEvents) => void;
    timeoutMs?: number;
    sessionId?: string;
  }) => Promise<WorkerResponseForRequest<T>>;
}

/** WebAuthnManager-owned host context: used by VRF-driven flows. */
export interface WebAuthnManagerContext {
  touchIdPrompt: TouchIdPrompt;
  nearClient: NearClient;
  indexedDB: UnifiedIndexedDBManager;
  userPreferencesManager: UserPreferencesManager;
  nonceManager: NonceManager;
  rpIdOverride?: string;
  nearExplorerUrl?: string;
}

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
