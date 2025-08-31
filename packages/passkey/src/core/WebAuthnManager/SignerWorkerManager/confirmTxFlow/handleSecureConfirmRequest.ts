import {
  extractPrfFromCredential,
  serializeRegistrationCredentialWithPRF,
  serializeAuthenticationCredentialWithPRF,
} from '../../credentialsHelpers';
import { VRFChallenge } from '../../../types/vrf-worker';
import type { SignerWorkerManagerContext } from '../index';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import {
  SecureConfirmMessage,
  SecureConfirmDecision,
  TransactionSummary,
  SecureConfirmMessageType,
  SecureConfirmData,
} from './types';
import { TransactionInputWasm } from '../../../types';
import { toAccountId } from '../../../types/accountIds';
import { awaitIframeModalDecision, mountIframeModalHostWithHandle } from '../../LitComponents/modal';
import { IFRAME_BUTTON_ID } from '../../LitComponents/IframeButtonWithTooltipConfirmer/tags';

/**
 * Handles secure confirmation requests from the worker with robust error handling
 * => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
 * and proper data validation. Supports both transaction and registration confirmation flows.
 */
export async function handlePromptUserConfirmInJsMainThread(
  ctx: SignerWorkerManagerContext,
  message: {
    type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
    data: SecureConfirmData,
  },
  worker: Worker
): Promise<void> {
  try {
    // 1. Validate and parse request
    const {
      data,
      summary,
      confirmationConfig,
      transactionSummary
    } = validateAndParseRequest({ ctx, message });

    // 2. Determine user confirmation parameters
  const { confirmed, confirmHandle, error: uiError } = await determineUserConfirmUI({
      ctx,
      confirmationConfig,
      transactionSummary,
      data,
    });

    // 3. Create initial decision
    let decision: SecureConfirmDecision = {
      requestId: data.requestId,
      intentDigest: data.intentDigest,
      confirmed: confirmed,
      _confirmHandle: confirmHandle
      // Store confirm handle for later cleanup
    };

    // 4. If user rejected (confirmed === false), exit early and do NOT prompt Touch ID
    if (!confirmed) {
      worker.postMessage({
        type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
        data: { ...decision, error: uiError }
      });
      return;
    }

    // 5. Collect credentials and PRF output (only if confirmed)
    let { decisionWithCredentials } = await collectTouchIdCredentials({
      ctx,
      data,
      decision,
    });

    // 6. Send confirmation response back to wasm-signer-worker
    worker.postMessage({
      type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
      data: decisionWithCredentials
    });

  } catch (error) {
    // Send error response
    worker.postMessage({
      type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
      data: {
        requestId: message.data?.requestId || 'unknown',
        intentDigest: message.data?.intentDigest,
        confirmed: false
      } as SecureConfirmDecision
    });
  }
}

/**
 * Renders confirmation UI based on the current configuration
 * Returns either boolean (for requireClick) or { confirmed: boolean, handle?: any } (for autoProceed)
 */
async function renderConfirmUI({
  ctx,
  summary,
  txSigningRequests,
  behavior,
  autoProceedDelay
}: {
  ctx: SignerWorkerManagerContext,
  summary: TransactionSummary,
  txSigningRequests?: TransactionInputWasm[],
  behavior?: 'requireClick' | 'autoProceed',
  autoProceedDelay?: number
}): Promise<{
  confirmed: boolean;
  confirmHandle?: {
    element: any,
    close: (confirmed: boolean) => void
  }
}> {
  switch (ctx.confirmationConfig.uiMode) {
    case 'embedded': {
      // Legacy embedded mode removed - using iframe approach instead
      throw new Error('Legacy embedded mode is no longer supported. Use the iframe-based EmbeddedTxConfirm component.');
    }

    case 'modal': {
      if (behavior === 'autoProceed') {
        const handle = await mountIframeModalHostWithHandle({
          ctx,
          summary,
          txSigningRequests,
          loading: true
        });
        if (autoProceedDelay) {
          await new Promise(resolve => setTimeout(resolve, autoProceedDelay));
        }
        return { confirmed: true, confirmHandle: handle };
      } else {
        const confirmed = await awaitIframeModalDecision({ ctx, summary, txSigningRequests });
        return { confirmed, confirmHandle: undefined };
      }
    }

    case 'skip': {
      // Automatically returns
      return { confirmed: true, confirmHandle: undefined };
    }

    default: {
      const handle = await mountIframeModalHostWithHandle({
        ctx,
        summary,
        txSigningRequests,
        loading: true
      });
      return { confirmed: true, confirmHandle: handle };
    }
  }
}

//////////////////////////////////
// === CONFIRMATION LOGIC ===
//////////////////////////////////

/**
 * Validates and parses the confirmation request data
 */
function validateAndParseRequest({ ctx, message }: {
  ctx: SignerWorkerManagerContext,
  message: SecureConfirmMessage,
}): {
  data: SecureConfirmData;
  summary: TransactionSummary;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
} {
  // Validate required fields
  const data = message.data;
  if (!data || !data.requestId) {
    throw new Error('Invalid secure confirm request - missing requestId');
  }

  // Parse and validate summary data (can contain extra fields we need)
  const summary = parseTransactionSummary(data.summary);
  // Get confirmation configuration from data (overrides user settings) or use user's settings
  const confirmationConfig = data.confirmationConfig || ctx.confirmationConfig;
  const transactionSummary: TransactionSummary = {
    totalAmount: summary?.totalAmount,
    method: summary?.method || (data.isRegistration ? 'Register Account' : undefined),
    fingerprint: data.intentDigest
  };

  // NOTE: postMessage strips the prototype and so the VrfChallenge object arrives
  // in handleSecureConfirmRequest as a plain object
  // We ensure it's properly typed as a VRFChallenge object
  const vrfChallenge: VRFChallenge = data.vrfChallenge;

  return {
    data: { ...data, vrfChallenge },
    summary,
    confirmationConfig,
    transactionSummary
  };
}


/**
 * Determines user confirmation based on UI mode and configuration
 */
async function determineUserConfirmUI({
  ctx,
  confirmationConfig,
  transactionSummary,
  data
}: {
  ctx: SignerWorkerManagerContext,
  confirmationConfig: any,
  transactionSummary: TransactionSummary,
  data: SecureConfirmData
}): Promise<{
  confirmed: boolean;
  confirmHandle?: {
    element: any,
    close: (confirmed: boolean) => void
  };
  error?: string;
}> {
  switch (confirmationConfig.uiMode) {
    case 'skip':
      // Bypass UI entirely - automatically confirm
      return { confirmed: true, confirmHandle: undefined };

    case 'embedded': {
      // For embedded mode, validate that the UI displayed transactions match
      // the worker-provided transactions by comparing canonical digests.
      try {
        const hostEl = document.querySelector(IFRAME_BUTTON_ID) as any;
        let uiDigest: string | null = null;
        if (hostEl?.requestUiIntentDigest) {
          uiDigest = await hostEl.requestUiIntentDigest();
          console.log('[SecureConfirm] digest check', { uiDigest, intentDigest: data.intentDigest });
        } else {
          console.error('[SecureConfirm]: missing requestUiIntentDigest on secure element');
        }
        // Debug: show UI digest and WASM worker's provided intentDigest for comparison
        if (uiDigest !== data.intentDigest) {
          console.error('[SecureConfirm]: UI digest mismatch');
          const errPayload = JSON.stringify({ code: 'ui_digest_mismatch', uiDigest, intentDigest: data.intentDigest });
          return { confirmed: false, confirmHandle: undefined, error: errPayload };
        }
        return { confirmed: true, confirmHandle: undefined };
      } catch (e) {
        console.error('[SecureConfirm]: Failed to validate UI digest', e);
        return { confirmed: false, confirmHandle: undefined, error: 'ui_digest_validation_failed' };
      }
    }

    case 'modal': {
      if (confirmationConfig.behavior === 'autoProceed') {
        // Use renderConfirmUI with autoProceed behavior
        return await renderConfirmUI({
          ctx,
          summary: transactionSummary,
          txSigningRequests: data.tx_signing_requests,
          behavior: 'autoProceed',
          autoProceedDelay: confirmationConfig?.autoProceedDelay
        });

      } else {
        // Require explicit confirm (requireClick behavior)
        return await renderConfirmUI({
          ctx,
          summary: transactionSummary,
          txSigningRequests: data.tx_signing_requests,
          behavior: 'requireClick'
        });
      }
    }

    default:
      // Fallback to modal with explicit confirm for unknown UI modes
      return await renderConfirmUI({
        ctx,
        summary: transactionSummary,
        txSigningRequests: data.tx_signing_requests,
        behavior: 'requireClick'
      });
  }
}

/**
 * Collects WebAuthn credentials and PRF output if conditions are met
 */
async function collectTouchIdCredentials({
  ctx,
  data,
  decision,
}: {
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData,
  decision: SecureConfirmDecision,
}): Promise<{ decisionWithCredentials: SecureConfirmDecision }> {

  const nearAccountId = data.nearAccountId;
  const vrfChallenge = data.vrfChallenge;

  try {
    const authenticators = await ctx.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));

    const credential = await ctx.touchIdPrompt.getCredentials({
      nearAccountId: nearAccountId,
      challenge: vrfChallenge,
      authenticators: authenticators,
    });

    // Extract PRF output for decryption (registration needs both PRF outputs)
    const dualPrfOutputs = extractPrfFromCredential({
      credential,
      firstPrfOutput: true,
      secondPrfOutput: data.isRegistration, // Registration needs second PRF output
    });

    if (!dualPrfOutputs.chacha20PrfOutput) {
      throw new Error('Failed to extract PRF output from credential');
    }

    // Serialize credential for WASM worker (use appropriate serializer based on flow type)
    const serializedCredential = data.isRegistration
      ? serializeRegistrationCredentialWithPRF({
          credential,
          firstPrfOutput: true,
          secondPrfOutput: true
        })
      : serializeAuthenticationCredentialWithPRF({ credential });

    return {
      decisionWithCredentials: {
        ...decision,
        credential: serializedCredential,
        prfOutput: dualPrfOutputs.chacha20PrfOutput,
        confirmed: true,
        _confirmHandle: undefined,
      }
    }

  } catch (credentialError) {
    console.error('[SignerWorkerManager]: Failed to collect credentials:', credentialError);
    const isDom = credentialError instanceof DOMException;
    const cancelled = isDom && (credentialError.name === 'NotAllowedError' || credentialError.name === 'AbortError');
    if (cancelled) {
      console.log('[SignerWorkerManager]: User cancelled secure confirm request');
    } else {
      console.error('[SignerWorkerManager]: Failed to handle secure confirm request:', credentialError);
    }
    // If credential collection fails, reject the transaction
    return {
      decisionWithCredentials: {
        ...decision,
        confirmed: false,
        _confirmHandle: undefined,
        error: cancelled ? 'User cancelled secure confirm request' : 'Failed to collect credentials'
      }
    }

  } finally {
    // If we auto-mounted the modal for context, close it now
    const confirmHandle = decision._confirmHandle;
    if (confirmHandle) {
      try { confirmHandle.close(true); } catch (e: any) { console.error(e) }
      decision._confirmHandle = undefined;
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
