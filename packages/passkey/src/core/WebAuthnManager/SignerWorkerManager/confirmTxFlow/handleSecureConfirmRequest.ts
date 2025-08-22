import {
  extractPrfFromCredential,
  serializeRegistrationCredentialWithPRF,
  serializeAuthenticationCredentialWithPRF,
} from '../../credentialsHelpers';
import { VRFChallenge } from '../../../types/vrf-worker';
import type { SignerWorkerManagerContext } from '../index';
import type { TransactionPayload } from '../../../types/signer-worker';
import {
  SecureConfirmMessage,
  SecureConfirmDecision,
  TransactionSummary,
  SecureConfirmMessageType
} from './types';

// Type for VRF challenge data that can be either a VRFChallenge instance or raw data
type VRFChallengeData = VRFChallenge | {
  vrfInput: string;
  vrfOutput: string;
  vrfProof: string;
  vrfPublicKey: string;
  userId: string;
  rpId: string;
  blockHeight: string;
  blockHash: string;
};

/**
 * Handles secure confirmation requests from the worker with robust error handling
 * and proper data validation. Supports both transaction and registration confirmation flows.
 */
export async function handleSecureConfirmRequest(
  ctx: SignerWorkerManagerContext,
  message: SecureConfirmMessage,
  worker: Worker
): Promise<void> {
  try {
    // 1. Validate and parse request
    const {
      data,
      summary,
      isRegistration,
      confirmationConfig,
      transactionSummary
    } = validateAndParseRequest(message, ctx);

    // 2. Determine user confirmation
    const { confirmed, confirmHandle } = await determineUserConfirmation(
      ctx,
      confirmationConfig,
      transactionSummary,
      data
    );

    // 3. Create initial decision
    let decision: SecureConfirmDecision = {
      requestId: data.requestId,
      intentDigest: data.intentDigest,
      confirmed
    };

    // Store confirm handle for later cleanup
    if (confirmHandle) {
      (decision as any)._confirmHandle = confirmHandle;
    }

    // 4. Collect credentials and PRF output if confirmed
    await collectCredentialsIfNeeded(ctx, decision, data, summary, isRegistration);

    // 5. Send confirmation response back to wasm-signer-worker
    worker.postMessage({
      type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
      data: decision
    });

  } catch (error) {
    console.error('[SignerWorkerManager]: Failed to handle secure confirm request:', error);
    // Send error response
    const errorDecision: SecureConfirmDecision = {
      requestId: message.data?.requestId || 'unknown',
      intentDigest: message.data?.intentDigest,
      confirmed: false
    };
    worker.postMessage({
      type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
      data: errorDecision
    });
  }
}


/**
 * Renders confirmation UI based on the current configuration
 * Returns either boolean (for requireClick) or { confirmed: boolean, handle?: any } (for autoProceed)
 */
async function renderConfirmUI(
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionPayload[],
  behavior?: 'requireClick' | 'autoProceed',
  autoProceedDelay?: number
): Promise<boolean | { confirmed: boolean; handle?: any }> {
  switch (ctx.confirmationConfig.uiMode) {
    case 'modal': {
      const { mountModalTxConfirm, mountModalTxConfirmWithHandle } = await import('../../LitComponents/modal');

      if (behavior === 'autoProceed') {
        // Show modal as context but do not wait for click; we'll close it after TouchID
        const handle = mountModalTxConfirmWithHandle({
          summary: {
            totalAmount: summary?.totalAmount,
            method: summary?.method,
            fingerprint: summary?.fingerprint,
          },
          txSigningRequests: txSigningRequests,
          mode: 'modal',
          loading: true // Show loading state with only cancel button
        });

        // Give user time to read transaction details before TouchID prompt (autoProceedDelay)
        if (autoProceedDelay) {
          console.debug(`[SignerWorkerManager]: Showing transaction details for ${autoProceedDelay}ms before TouchID prompt...`);
          await new Promise(resolve => setTimeout(resolve, autoProceedDelay));
        }

        return { confirmed: true, handle };
      } else {
        // Require explicit confirm (requireClick behavior)
        const confirmed = await mountModalTxConfirm({
          summary: {
            totalAmount: summary?.totalAmount,
            method: summary?.method,
            fingerprint: summary?.fingerprint,
          },
          txSigningRequests: txSigningRequests,
          mode: 'modal'
        });
        return confirmed;
      }
    }
    case 'embedded': {
      // Legacy embedded mode removed - using iframe approach instead
      throw new Error('Legacy embedded mode is no longer supported. Use the iframe-based EmbeddedTxConfirm component.');
    }

    default: {
      // Fallback to modal mode if unknown
      const { mountModalTxConfirm } = await import('../../LitComponents/modal');
      const confirmed = await mountModalTxConfirm({
        summary: {
          totalAmount: summary?.totalAmount,
          method: summary?.method,
          fingerprint: summary?.fingerprint,
        },
        txSigningRequests: txSigningRequests,
        mode: 'modal'
      });
      return confirmed;
    }
  }
}

//////////////////////////////////
// === CONFIRMATION LOGIC ===
//////////////////////////////////

/**
 * Validates and parses the confirmation request data
 */
function validateAndParseRequest(message: SecureConfirmMessage, ctx: SignerWorkerManagerContext) {
  // Validate required fields
  const data = message.data;
  if (!data || !data.requestId) {
    throw new Error('Invalid secure confirm request - missing requestId');
  }

  // Parse and validate summary data (can contain extra fields we need)
  const summary = parseTransactionSummary(data.summary);
  const isRegistration = summary?.isRegistration || (summary as any)?.type === 'registration';

  // Extract receiverId from transaction data for the "to" field
  let receiverId: string | undefined;
  if (summary?.receiverId) {
    receiverId = summary.receiverId;
  }

  // Get confirmation configuration from data or use default
  // For embedded component, always use embedded mode regardless of user settings
  const confirmationConfig = data.confirmationConfig || ctx.confirmationConfig;

  const transactionSummary: TransactionSummary = {
    totalAmount: summary?.totalAmount,
    method: summary?.method || (isRegistration ? 'Register Account' : undefined),
    fingerprint: data.intentDigest
  };

  return {
    data,
    summary,
    isRegistration,
    receiverId,
    confirmationConfig,
    transactionSummary
  };
}


/**
 * Determines user confirmation based on UI mode and configuration
 */
async function determineUserConfirmation(
  ctx: SignerWorkerManagerContext,
  confirmationConfig: any,
  transactionSummary: TransactionSummary,
  data: any
): Promise<{ confirmed: boolean; confirmHandle?: any }> {
  switch (confirmationConfig.uiMode) {
    case 'skip':
      // Bypass UI entirely - automatically confirm
      return { confirmed: true };

    case 'embedded': {
      // Auto-confirm since user has already seen and confirmed in iframe
      // Set the request ID in the EmbeddedTxConfirm component
      if ((window as any).setEmbeddedTxConfirmRequestId) {
        (window as any).setEmbeddedTxConfirmRequestId(data.requestId);
      }
      // For embedded mode, we automatically confirm since the user has already
      // seen the transaction details and clicked confirm in the iframe
      // The WASM worker will validate the transaction details against what was shown
      return { confirmed: true };
    }

    case 'modal': {
      if (confirmationConfig.behavior === 'autoProceed') {
        // Use renderConfirmUI with autoProceed behavior
        const result = await renderConfirmUI(
          ctx,
          transactionSummary,
          data.tx_signing_requests,
          'autoProceed',
          confirmationConfig?.autoProceedDelay
        ) as { confirmed: boolean; handle?: any };
        return { confirmed: result.confirmed, confirmHandle: result.handle };

      } else {
        // Require explicit confirm (requireClick behavior)
        const confirmed = await renderConfirmUI(ctx, transactionSummary, data.tx_signing_requests, 'requireClick') as boolean;
        return { confirmed };
      }
    }

    default:
      // Fallback to modal with explicit confirm for unknown UI modes
      const confirmed = await renderConfirmUI(ctx, transactionSummary, data.tx_signing_requests, 'requireClick') as boolean;
      return { confirmed };
  }
}

/**
 * Collects WebAuthn credentials and PRF output if conditions are met
 */
async function collectCredentialsIfNeeded(
  ctx: SignerWorkerManagerContext,
  decision: SecureConfirmDecision,
  data: any,
  summary: any,
  isRegistration: boolean
): Promise<void> {

  const nearAccountIdFromMsg = (data as any)?.nearAccountId;
  const vrfLike: VRFChallengeData | undefined = data.vrfChallenge;

  if (!decision.confirmed || !nearAccountIdFromMsg || !vrfLike) {
    console.warn('[SignerWorkerManager]: Skipping credentials collection - conditions not met:', {
      confirmed: decision.confirmed,
      nearAccountIdFromMsg,
      hasVrfLike: !!vrfLike
    });
    return;
  }

  try {
    // Get credentials using TouchID prompt
    const vrfChallengeObj: VRFChallenge = (vrfLike instanceof VRFChallenge)
      ? vrfLike
      : new VRFChallenge({
          vrfInput: vrfLike.vrfInput,
          vrfOutput: vrfLike.vrfOutput,
          vrfProof: vrfLike.vrfProof,
          vrfPublicKey: vrfLike.vrfPublicKey,
          userId: vrfLike.userId,
          rpId: vrfLike.rpId,
          blockHeight: vrfLike.blockHeight,
          blockHash: vrfLike.blockHash,
        });

    const authenticators = await ctx.clientDB.getAuthenticatorsByUser(nearAccountIdFromMsg);

    const credential = await ctx.touchIdPrompt.getCredentials({
      nearAccountId: nearAccountIdFromMsg,
      challenge: vrfChallengeObj.outputAs32Bytes(),
      authenticators: authenticators,
    });

    // Extract PRF output for decryption (registration needs both PRF outputs)
    const dualPrfOutputs = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: isRegistration, // Registration needs second PRF output
    });

    if (!dualPrfOutputs.chacha20PrfOutput) {
      throw new Error('Failed to extract PRF outputs from credential');
    }

    // Serialize credential for WASM worker (use appropriate serializer based on flow type)
    const serializedCredential = isRegistration
      ? serializeRegistrationCredentialWithPRF({
          credential,
          firstPrfOutput: true,
          secondPrfOutput: true
        })
      : serializeAuthenticationCredentialWithPRF({ credential });

    // Add credentials to decision
    decision.credential = serializedCredential;
    decision.prfOutput = dualPrfOutputs.chacha20PrfOutput;

    // If we auto-mounted the modal for context, close it now
    const confirmHandle = (decision as any)._confirmHandle as { close: (confirmed: boolean) => void } | undefined;
    if (confirmHandle && typeof confirmHandle.close === 'function') {
      try {
        confirmHandle.close(true);
      } catch (e: any) {
        console.log(e)
      }
      (decision as any)._confirmHandle = undefined;
    }
  } catch (credentialError) {
    console.error('[SignerWorkerManager]: Failed to collect credentials:', credentialError);
    // If credential collection fails, reject the transaction
    decision.confirmed = false;
    // Close auto-mounted modal if present
    const confirmHandle = (decision as any)._confirmHandle as { close: (confirmed: boolean) => void } | undefined;
    if (confirmHandle && typeof confirmHandle.close === 'function') {
      try { confirmHandle.close(false); } catch {}
      (decision as any)._confirmHandle = undefined;
    }
  }
}

/**
 * Safely parses transaction summary data, handling both string and object formats
 */
function parseTransactionSummary(summaryData: string | object | undefined): any {
  if (!summaryData) {
    return {};
  }
  if (typeof summaryData === 'string') {
    try {
      return JSON.parse(summaryData);
    } catch (parseError) {
      console.warn('[SignerWorkerManager]: Failed to parse summary string:', parseError);
      return {};
    }
  }
  if (typeof summaryData === 'object' && summaryData !== null) {
    return summaryData;
  }
  console.warn('[SignerWorkerManager]: Unexpected summary data type:', typeof summaryData);
  return {};
}


