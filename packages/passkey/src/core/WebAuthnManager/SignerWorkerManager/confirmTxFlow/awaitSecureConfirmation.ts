import { SecureConfirmMessageType, WorkerConfirmationResponse } from './types';

/**
 * Bridge function called from Rust to await user confirmation on the main thread
 *
 * This function is exposed globally for WASM to call and handles the worker-side
 * of the confirmation flow by:
 * 1. Sending a confirmation request to the main thread
 * 2. Waiting for the user's decision
 * 3. Returning the decision back to the WASM worker
 */
export function awaitSecureConfirmation(
  requestId: string,
  summary: any,
  digest: string,
  txSigningRequestsJson: string | undefined
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve) => {
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
     * @param e - MessageEvent containing the user's confirmation response
     */
    const onDecisionReceived = (e: MessageEvent) => {
      const { data } = e;
      if (
        data?.type === SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE &&
        data?.data?.requestId === requestId
      ) {
        console.log('[signer-worker]: Passkey response received, returning payload to Rust for requestId', requestId, data.data);
        self.removeEventListener('message', onDecisionReceived as any);
        resolve({
          requestId,
          intentDigest: data.data?.intentDigest,
          confirmed: !!data.data?.confirmed,
          credential: data.data?.credential,
          prfOutput: data.data?.prfOutput,
        });
      }
    };

    self.addEventListener('message', onDecisionReceived as any);

    // Parse summary and send confirmation request to main thread
    const parsedSummary = typeof summary === 'string' ? safeJsonParse(summary, summary) : summary;

    // Parse transaction signing requests if provided, otherwise use empty array
    const parsedTxSigningRequests = txSigningRequestsJson ? safeJsonParse(txSigningRequestsJson, []) : [];

    self.postMessage({
      type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
      data: {
        requestId,
        summary: parsedSummary,
        intentDigest: digest,
        tx_signing_requests: parsedTxSigningRequests,
        nearAccountId: parsedSummary?.nearAccountId,
        vrfChallenge: parsedSummary?.vrfChallenge,
        confirmationConfig: parsedSummary?.confirmationConfig
      }
    });
  });
}

/**
 * Helper function to safely parse JSON with fallback
 */
function safeJsonParse(jsonString: string, fallback: any = {}): any {
  try {
    return jsonString ? JSON.parse(jsonString) : fallback;
  } catch (error) {
    console.warn('[signer-worker]: Failed to parse JSON:', error);
    return Array.isArray(fallback) ? [jsonString] : { rawData: jsonString };
  }
}
