import type { VrfWorkerManagerContext } from '../';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import { determineConfirmationConfig } from './determineConfirmationConfig';
import {
  TransactionSummary,
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SecureConfirmationType,
} from './types';
import { errorMessage, toError } from '../../../../utils/errors';
import {
  parseTransactionSummary,
  getIntentDigest,
  sendConfirmResponse,
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
  ctx: VrfWorkerManagerContext,
  message: {
    type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
    data: SecureConfirmRequest,
  },
  worker: Worker
): Promise<void> {

  // 1. Validate and parse request
  let request: SecureConfirmRequest;
  let confirmationConfig: ConfirmationConfig;
  let transactionSummary: TransactionSummary;

  try {
    // eslint-disable-next-line no-console
    console.debug('[SecureConfirm][Host] handlePromptUserConfirmInJsMainThread: received request', {
      type: message?.data?.type,
      requestId: message?.data?.requestId,
    });
    const parsed = validateAndParseRequest({ ctx, request: message.data });
    request = parsed.request as SecureConfirmRequest;
    confirmationConfig = parsed.confirmationConfig;
    transactionSummary = parsed.transactionSummary;
  } catch (e: unknown) {
    console.error('[SecureConfirm][Host] validateAndParseRequest failed', e);
    // Attempt to send a structured error back to the worker to avoid hard failure
    try {
      const rid = (message?.data as any)?.requestId;
      if (typeof rid === 'string' && rid) {
        sendConfirmResponse(worker, {
          requestId: rid,
          confirmed: false,
          error: errorMessage(e) || 'Invalid secure confirm request',
        });
        return;
      }
    } catch (_err: unknown) {
      throw toError(e);
    }
    throw toError(e);
  }

  // Extra diagnostics: ensure payload exists and has required fields
  if (!request?.payload) {
    console.error('[SecureConfirm][Host] Invalid secure confirm request: missing payload', request);
    sendConfirmResponse(worker, {
      requestId: request.requestId,
      confirmed: false,
      error: 'Invalid secure confirm request - missing payload'
    });
    return;
  }

  switch (request.type) {
    case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF:
    case SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI: {
      const { handleLocalOnlyFlow } = await import('./flows/localOnly').catch((e) => {
        console.error('[SecureConfirm][Host] failed to import localOnly flow module', e);
        throw e;
      });
      await handleLocalOnlyFlow(ctx, request as LocalOnlySecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
      return;
    }
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE: {
      const { handleRegistrationFlow } = await import('./flows/registration').catch((e) => {
        console.error('[SecureConfirm][Host] failed to import registration flow module', e);
        throw e;
      });
      await handleRegistrationFlow(ctx, request as RegistrationSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
      return;
    }
    case SecureConfirmationType.SIGN_TRANSACTION:
    case SecureConfirmationType.SIGN_NEP413_MESSAGE: {
      const { handleTransactionSigningFlow } = await import('./flows/transactions').catch((e) => {
        console.error('[SecureConfirm][Host] failed to import transactions flow module', e);
        throw e;
      });
      await handleTransactionSigningFlow(ctx, request as SigningSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
      return;
    }
    default: {
      // Unsupported type fallback: return structured error to worker.
      sendConfirmResponse(worker, {
        requestId: request.requestId,
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
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
}): {
  request: SecureConfirmRequest;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
} {
  // Defensive guard: signing envelopes must not carry PRF or wrap-key material on the main thread.
  if (
    request.type === SecureConfirmationType.SIGN_TRANSACTION
    || request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE
  ) {
    const payload: any = (request as SigningSecureConfirmRequest)?.payload || {};
    if (payload.prfOutput !== undefined) {
      throw new Error('Invalid secure confirm request: forbidden signing payload field prfOutput');
    }
    if (payload.wrapKeySeed !== undefined) {
      throw new Error('Invalid secure confirm request: forbidden signing payload field wrapKeySeed');
    }
    if (payload.wrapKeySalt !== undefined) {
      throw new Error('Invalid secure confirm request: forbidden signing payload field wrapKeySalt');
    }
    if (payload.vrf_sk !== undefined) {
      throw new Error('Invalid secure confirm request: forbidden signing payload field vrf_sk');
    }
  }
  // Get confirmation configuration from data (overrides user settings) or use user's settings,
  // then compute effective config based on runtime and request type
  const confirmationConfig: ConfirmationConfig = determineConfirmationConfig(ctx, request);
  const parsedSummary = parseTransactionSummary(request.summary);
  const intentDigest = getIntentDigest(request);
  const transactionSummary: TransactionSummary = {
    ...parsedSummary,
    ...(intentDigest ? { intentDigest } : {}),
  };

  return {
    request,
    confirmationConfig,
    transactionSummary: sanitizeForPostMessage(transactionSummary) as TransactionSummary
  };
}
