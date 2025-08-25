import { SecureConfirmMessageType, WorkerConfirmationResponse } from './types';

interface ConfirmationData {
  intentDigest: string;
  nearAccountId: string;
  vrfChallenge: string;
  confirmationConfig: any;
}

interface ConfirmationSummaryAction {
  to: string;
  totalAmount: string;
}

interface ConfirmationSummaryRegistration {
  type: string;
  nearAccountId: string;
  deviceNumber: number;
  contractId: string;
  deterministicVrfPublicKey: string;
}

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
  digest: string,
  summary: string,
  confirmationData: string,
  txSigningRequestsJson: string | undefined
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve, reject) => {

    console.log("awaitSecureConfirmation called with: ", {
      requestId,
      digest,
      summary,
      confirmationData,
      txSigningRequestsJson,
    });

    // parsedSummary is only use for display purposes
    let parsedSummary: ConfirmationSummaryAction | ConfirmationSummaryRegistration;
    let parsedConfirmationData: ConfirmationData;
    let parsedTxSigningRequests: any[] = [];

    try {
      if (summary.includes("to") && summary.includes("totalAmount")) {
        parsedSummary = safeJsonParseStrict<ConfirmationSummaryAction>(summary, 'action summary');
      } else {
        parsedSummary = safeJsonParseStrict<ConfirmationSummaryRegistration>(summary, 'registration summary');
      }
      parsedConfirmationData = safeJsonParseStrict<ConfirmationData>(confirmationData, 'confirmationData');
      parsedTxSigningRequests = txSigningRequestsJson
        ? safeJsonParseStrict<any[]>(txSigningRequestsJson, 'txSigningRequestsJson')
        : [];
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
        });
      }
    };

    self.addEventListener('message', onDecisionReceived);

    self.postMessage({
      type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
      data: {
        requestId,
        summary: parsedSummary,
        intentDigest: digest,
        tx_signing_requests: parsedTxSigningRequests,
        nearAccountId: parsedConfirmationData?.nearAccountId,
        vrfChallenge: parsedConfirmationData?.vrfChallenge,
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
