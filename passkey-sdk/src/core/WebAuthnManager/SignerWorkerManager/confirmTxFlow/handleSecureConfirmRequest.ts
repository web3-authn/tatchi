import type { SignerWorkerManagerContext } from '../index';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import { determineConfirmationConfig } from './determineConfirmationConfig';
import {
  SecureConfirmDecision,
  TransactionSummary,
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SecureConfirmationType,
} from './types';
import { errorMessage, toError } from '../../../../utils/errors';
import {
  parseTransactionSummary,
  getIntentDigest,
  classifyFlow,
  sanitizeForPostMessage,
} from './flows/common';
import type {
  LocalOnlySecureConfirmRequest,
  RegistrationSecureConfirmRequest,
  SigningSecureConfirmRequest,
} from './types';

/**
 * Handles secure confirmation requests from the worker with robust error handling
 * => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
 * and proper data validation. Supports both transaction and registration confirmation flows.
 */
export async function handlePromptUserConfirmInJsMainThread(
  ctx: SignerWorkerManagerContext,
  message: {
    type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
    data: SecureConfirmRequest,
  },
  worker: Worker
): Promise<void> {

  // 1. Validate and parse request
  let request: SecureConfirmRequest;
  let summary: TransactionSummary;
  let confirmationConfig: ConfirmationConfig;
  let transactionSummary: TransactionSummary;

  try {
    const parsed = validateAndParseRequest({ ctx, request: message.data });
    request = parsed.request as SecureConfirmRequest;
    summary = parsed.summary;
    confirmationConfig = parsed.confirmationConfig;
    transactionSummary = parsed.transactionSummary;
  } catch (e: unknown) {
    console.error('[SecureConfirm][Host] validateAndParseRequest failed', e);
    // Attempt to send a structured error back to the worker to avoid hard failure
    try {
      const rid = message?.data?.requestId;
      sendWorkerResponse(worker, {
        requestId: rid,
        confirmed: false,
        error: errorMessage(e) || 'Invalid secure confirm request'
      });
      return;
    } catch (_err: unknown) {
      throw toError(e);
    }
  }

  // Extra diagnostics: ensure payload exists and has required fields
  if (!request?.payload) {
    console.error('[SecureConfirm][Host] Invalid secure confirm request: missing payload', request);
    sendWorkerResponse(worker, {
      requestId: request.requestId,
      confirmed: false,
      error: 'Invalid secure confirm request - missing payload'
    });
    return;
  }

  // 2. Classify and dispatch to per-flow handlers
  const flowKind = classifyFlow(request);
  switch (flowKind) {
    case 'LocalOnly': {
      const { handleLocalOnlyFlow } = await import('./flows/localOnly');
      await handleLocalOnlyFlow(ctx, request as LocalOnlySecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
      return;
    }
    case 'Registration': {
      const { handleRegistrationFlow } = await import('./flows/registration');
      await handleRegistrationFlow(ctx, request as RegistrationSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
      return;
    }
    case 'Signing': {
      const { handleTransactionSigningFlow } = await import('./flows/transactions');
      await handleTransactionSigningFlow(ctx, request as SigningSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
      return;
    }
    default: {
      // Unsupported type fallback: return structured error to worker.
      sendWorkerResponse(worker, {
        requestId: (message?.data as any)?.requestId,
        confirmed: false,
        error: 'Unsupported secure confirmation type'
      });
    }
  }
}

/**
 * Validates and parses the confirmation request data
 */
function validateAndParseRequest({ ctx, request }: {
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest,
}): {
  request: SecureConfirmRequest;
  summary: TransactionSummary;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
} {
  // Parse and validate summary data (can contain extra fields we need)
  const summary = parseTransactionSummary(request.summary);
  // Get confirmation configuration from data (overrides user settings) or use user's settings,
  // then compute effective config based on runtime and request type
  const confirmationConfig: ConfirmationConfig = determineConfirmationConfig(ctx, request);
  const transactionSummary: TransactionSummary = {
    totalAmount: summary?.totalAmount,
    method: summary?.method,
    intentDigest: getIntentDigest(request),
  };

  return {
    request,
    summary,
    confirmationConfig,
    transactionSummary
  };
}

/**
 * Sends response to worker with consistent message format
 */
function sendWorkerResponse(worker: Worker, responseData: SecureConfirmDecision): void {
  // Sanitize payload to ensure postMessage structured-clone safety
  const sanitized = sanitizeForPostMessage(responseData);
  worker.postMessage({
    type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
    data: sanitized
  });
  try {
    const bh = (sanitized as any)?.vrfChallenge?.blockHeight;
    if (bh) console.debug('[SecureConfirm] Sent VRF challenge block height', bh);
  } catch {}
}
