import { TransactionInputWasm } from '../../../types';
import {
  WorkerConfirmationResponse,
  SecureConfirmMessageType,
  SecureConfirmData,
  ConfirmationSummaryAction,
  ConfirmationSummaryRegistration
} from './types';
import { VRFChallenge } from '@/core/types/vrf-worker';
import { VRFChallengeData } from '@/wasm_vrf_worker/wasm_vrf_worker';

/**
 * Bridge function called from Rust to await user confirmation on the main thread
 *
 * This function is exposed globally for WASM to call and handles the worker-side
 * of the confirmation flow by:
 * 1. Sending a confirmation request to the main thread
 * 2. Waiting for the user's decision
 * 3. Returning the decision back to the WASM worker
 *
 * See await_secure_confirmation() function definition in src/handlers/confirm_tx_details.rs
 * for more details on the parameters and their types
 */
export function awaitSecureConfirmation(
  requestId: string,
  summary: string,
  confirmationData: string,
  txSigningRequestsJson: string | undefined
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve, reject) => {


    // parsedSummary is only use for display purposes
    let parsedSummary: ConfirmationSummaryAction | ConfirmationSummaryRegistration;
    let parsedConfirmationData: SecureConfirmData;
    let parsedTxSigningRequests: TransactionInputWasm[] = [];

    try {
      parsedSummary = parseSummary(summary);
      parsedConfirmationData = parseConfirmationData(confirmationData);
      parsedTxSigningRequests = parseTxSigningRequests(txSigningRequestsJson);
    } catch (error) {
      return reject(error);
    }

    /**
     * Handles the user confirmation response from the main thread
     *
     * This listener waits for the main thread to send back the user's decision
     * after they've been prompted for confirmation (via modal, embedded UI, etc.)
     *
     * When the response is received:
     * 1. Validates the response matches our request ID
     * 2. Extracts the user's decision (confirmed/rejected)
     * 3. Extracts credentials and PRF output if confirmed
     * 4. Resolves the promise to return the result to Rust WASM
     *
     * @param messageEvent - MessageEvent containing the user's confirmation response
     */
    const onDecisionReceived = (messageEvent: MessageEvent) => {
      const { data } = messageEvent;
      if (
        data?.type === SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE &&
        data?.data?.requestId === requestId
      ) {
        // Always remove listener once we've handled this requestId
        self.removeEventListener('message', onDecisionReceived);

        // Validate payload shape; do NOT reject on confirmed === false (that's a valid user choice)
        if (typeof data?.data?.confirmed !== 'boolean') {
          return reject(new Error('[signer-worker]: Invalid confirmation response: missing boolean "confirmed"'));
        }

        // Rust expects snake_case fields
        resolve({
          request_id: requestId,
          intent_digest: data.data?.intentDigest,
          confirmed: !!data.data?.confirmed,
          credential: data.data?.credential,
          prf_output: data.data?.prfOutput,
          vrf_challenge: data.data?.vrfChallenge,           // VRF challenge from confirmation flow
          transaction_context: data.data?.transactionContext, // NEAR data from confirmation flow
          error: data.data?.error
        });
      }
    };

    self.addEventListener('message', onDecisionReceived);

    self.postMessage({
      type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
      data: {
        requestId: requestId,
        summary: parsedSummary,
        intentDigest: parsedConfirmationData?.intentDigest,
        rpcCall: parsedConfirmationData?.rpcCall,
        tx_signing_requests: parsedTxSigningRequests,
        confirmationConfig: parsedConfirmationData?.confirmationConfig
      }
    });
  });
}

/**
 * Helper function to strictly parse JSON. Throws on failure.
 */
function safeJsonParseStrict<T>(jsonString: string, context: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error(`[signer-worker]: Failed to parse ${context} JSON:`, error);
    throw error instanceof Error ? error : new Error(`Invalid JSON in ${context}`);
  }
}

function parseSummary(summary: string): ConfirmationSummaryAction | ConfirmationSummaryRegistration {
  if (summary.includes("to") && summary.includes("totalAmount")) {
    return safeJsonParseStrict<ConfirmationSummaryAction>(summary, 'action summary');
  } else {
    return safeJsonParseStrict<ConfirmationSummaryRegistration>(summary, 'registration summary');
  }
}

function parseConfirmationData(confirmationData: string): SecureConfirmData {
  let parsedConfirmationData = safeJsonParseStrict<SecureConfirmData>(confirmationData, 'confirmationData');
  // NOTE: postMessage strips the prototype and so the VRFChallenge object arrives
  // in handleSecureConfirmRequest as a plain object
  // The standalone outputAs32Bytes() function handles the conversion
  return parsedConfirmationData;
}

function parseTxSigningRequests(txSigningRequestsJson?: string): TransactionInputWasm[] {
  if (!txSigningRequestsJson) {
    return [];
  }
  return safeJsonParseStrict<TransactionInputWasm[]>(txSigningRequestsJson, 'txSigningRequestsJson');
}