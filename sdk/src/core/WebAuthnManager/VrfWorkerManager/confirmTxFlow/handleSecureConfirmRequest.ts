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
} from './flows';
import {
  assertNoForbiddenMainThreadSigningSecrets,
  validateSecureConfirmRequest,
} from './adapters/requestAdapter';
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

    request = validateSecureConfirmRequest(message.data);
    assertNoForbiddenMainThreadSigningSecrets(request);
    confirmationConfig = determineConfirmationConfig(ctx, request);

    const parsedSummary = parseTransactionSummary(request.summary);
    const intentDigest = getIntentDigest(request);

    transactionSummary = sanitizeForPostMessage({
      ...parsedSummary,
      ...(intentDigest ? { intentDigest } : {}),
    }) as TransactionSummary;

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

  const handler = HANDLERS[request.type];
  if (!handler) {
    // Unsupported type fallback: return structured error to worker.
    sendConfirmResponse(worker, {
      requestId: request.requestId,
      confirmed: false,
      error: 'Unsupported secure confirmation type'
    });
    return;
  }

  try {
    await handler({ ctx, request, worker, confirmationConfig, transactionSummary });
  } catch (e: unknown) {
    console.error('[SecureConfirm][Host] handler failed', e);
    // Best-effort: always respond to the worker so VRF-side requests don't hang indefinitely.
    sendConfirmResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: errorMessage(e) || 'Secure confirmation failed',
    });
  }
}

type HandlerArgs = {
  ctx: VrfWorkerManagerContext;
  request: SecureConfirmRequest;
  worker: Worker;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
};

type Handler = (args: HandlerArgs) => Promise<void>;

async function importFlow<T>(label: string, loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (e) {
    console.error(`[SecureConfirm][Host] failed to import ${label} flow module`, e);
    throw e;
  }
}

const HANDLERS: Partial<Record<SecureConfirmationType, Handler>> = {
  [SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF]: async ({ ctx, request, worker, confirmationConfig, transactionSummary }) => {
    const { handleLocalOnlyFlow } = await importFlow('localOnly', () => import('./flows/localOnly'));
    await handleLocalOnlyFlow(ctx, request as LocalOnlySecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
  },
  [SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI]: async ({ ctx, request, worker, confirmationConfig, transactionSummary }) => {
    const { handleLocalOnlyFlow } = await importFlow('localOnly', () => import('./flows/localOnly'));
    await handleLocalOnlyFlow(ctx, request as LocalOnlySecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
  },
  [SecureConfirmationType.REGISTER_ACCOUNT]: async ({ ctx, request, worker, confirmationConfig, transactionSummary }) => {
    const { handleRegistrationFlow } = await importFlow('registration', () => import('./flows/registration'));
    await handleRegistrationFlow(ctx, request as RegistrationSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
  },
  [SecureConfirmationType.LINK_DEVICE]: async ({ ctx, request, worker, confirmationConfig, transactionSummary }) => {
    const { handleRegistrationFlow } = await importFlow('registration', () => import('./flows/registration'));
    await handleRegistrationFlow(ctx, request as RegistrationSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
  },
  [SecureConfirmationType.SIGN_TRANSACTION]: async ({ ctx, request, worker, confirmationConfig, transactionSummary }) => {
    const { handleTransactionSigningFlow } = await importFlow('transactions', () => import('./flows/transactions'));
    await handleTransactionSigningFlow(ctx, request as SigningSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
  },
  [SecureConfirmationType.SIGN_NEP413_MESSAGE]: async ({ ctx, request, worker, confirmationConfig, transactionSummary }) => {
    const { handleTransactionSigningFlow } = await importFlow('transactions', () => import('./flows/transactions'));
    await handleTransactionSigningFlow(ctx, request as SigningSecureConfirmRequest, worker, { confirmationConfig, transactionSummary });
  },
};
