import type { PasskeyFixture } from './fixtures';
import type { TestUtils } from './index';
import { printLog } from './logging';
import { ActionType } from '../../core/types/actions';

export interface RegistrationFlowOptions {
  accountId?: string;
  confirmVariant?: 'skip' | 'autoProceed';
}

export interface RegistrationFlowResult {
  success: boolean;
  accountId: string;
  events: any[];
  error?: string;
  skippedDueToExisting?: boolean;
  raw?: any;
}

export async function registerPasskey(
  passkey: PasskeyFixture,
  options: RegistrationFlowOptions = {}
): Promise<RegistrationFlowResult> {
  await passkey.setup();

  const accountId = options.accountId ?? (await passkey.withTestUtils(() => {
    const utils = (window as any).testUtils as TestUtils;
    return utils.generateTestAccountId();
  }));

  printLog('flow', `starting registration for ${accountId}`, { step: 'register' });

  const registrationResult = await passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const toAccountId = (window as any).toAccountId ?? ((id: string) => id);
    const events: any[] = [];

    const confirmVariant = args.confirmVariant ?? 'skip';
    const overrides = (utils.confirmOverrides ?? {}) as Record<string, any>;
    const defaultConfirm = { uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' };
    const confirmConfig = overrides[confirmVariant] ?? overrides.skip ?? defaultConfirm;

    try {
      console.log(`[flow:register] invoking registerPasskeyInternal for ${args.accountId}`);
      return utils.passkeyManager.registerPasskeyInternal(toAccountId(args.accountId), {
        onEvent: (event: any) => {
          events.push(event);
          console.log(`[flow:register]   -> ${event.phase} | ${event.message}`);
        },
        onError: (error: any) => {
          console.error(`[flow:register] ! ${error}`);
        }
      }, confirmConfig).then((result: any) => {
        const response: RegistrationFlowResult = {
          success: !!result.success,
          accountId: args.accountId,
          events,
          raw: result,
          error: result?.error,
          skippedDueToExisting: false,
        };

        if (!response.success && typeof response.error === 'string' && response.error.includes('already exists')) {
          response.skippedDueToExisting = true;
          response.success = true;
        }

        return response;
      });
    } catch (error: any) {
      console.error(`[flow:register] error: ${error?.message || error}`);
      const fallback: RegistrationFlowResult = {
        success: false,
        accountId: args.accountId,
        events,
        error: error?.message || String(error),
        skippedDueToExisting: false,
      };
      return fallback;
    }
  }, { accountId, confirmVariant: options.confirmVariant ?? 'skip' });

  if (registrationResult.skippedDueToExisting) {
    printLog('flow', `registration skipped because ${accountId} already exists`, {
      step: 'register',
      indent: 1,
    });
  } else {
    printLog('flow', `registration ${registrationResult.success ? 'succeeded' : 'failed'} for ${accountId}` , {
      step: 'register',
      indent: 1,
    });
  }

  return registrationResult;
}

export interface LoginFlowOptions {
  accountId: string;
}

export interface LoginFlowResult {
  success: boolean;
  accountId: string;
  events: any[];
  error?: string;
  raw?: any;
}

export async function loginPasskey(
  passkey: PasskeyFixture,
  options: LoginFlowOptions
): Promise<LoginFlowResult> {
  await passkey.setup();

  const accountId = options.accountId;
  printLog('flow', `starting login for ${accountId}`, { step: 'login' });

  const loginResult = await passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const toAccountId = (window as any).toAccountId ?? ((id: string) => id);
    const events: any[] = [];

    try {
      console.log(`[flow:login] invoking loginPasskey for ${args.accountId}`);
      return utils.passkeyManager.loginPasskey(toAccountId(args.accountId), {
        onEvent: (event: any) => {
          events.push(event);
          console.log(`[flow:login]   -> ${event.phase} | ${event.message}`);
        },
        onError: (error: any) => {
          console.error(`[flow:login] ! ${error}`);
        }
      }).then((result: any) => ({
        success: !!result.success,
        accountId: args.accountId,
        events,
        error: result?.error,
        raw: result,
      }));
    } catch (error: any) {
      console.error(`[flow:login] error: ${error?.message || error}`);
      return {
        success: false,
        accountId: args.accountId,
        events,
        error: error?.message || String(error),
      };
    }
  }, { accountId });

  printLog('flow', `login ${loginResult.success ? 'succeeded' : 'failed'} for ${accountId}`, {
    step: 'login',
    indent: 1,
  });

  return loginResult;
}

export interface TransferFlowOptions {
  accountId: string;
  receiverId: string;
  amountYocto: string;
  actionType?: ActionType.Transfer;
}

export interface TransferFlowResult {
  success: boolean;
  events: any[];
  error?: string;
  raw?: any;
}

export async function executeTransfer(
  passkey: PasskeyFixture,
  options: TransferFlowOptions
): Promise<TransferFlowResult> {
  await passkey.setup();

  const actionType = options.actionType ?? ActionType.Transfer;

  printLog('flow', `initiating transfer ${options.accountId} → ${options.receiverId}`, {
    step: 'transfer',
  });

  const result = await passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const toAccountId = (window as any).toAccountId ?? ((id: string) => id);
    const events: any[] = [];

    try {
      console.log(`[flow:transfer] executing action for ${args.accountId}`);
      return utils.passkeyManager.executeAction({
        nearAccountId: toAccountId(args.accountId),
        receiverId: args.receiverId,
        actionArgs: {
          type: args.actionType ?? 'Transfer',
          amount: args.amountYocto,
        },
        options: {
          onEvent: (event: any) => {
            events.push(event);
            console.log(`[flow:transfer]   -> ${event.phase} | ${event.message}`);
          },
          onError: (error: any) => {
            console.error(`[flow:transfer] ! ${error}`);
          }
        }
      }).then((result: any) => ({
        success: !!result.success,
        events,
        error: result?.error,
        raw: result,
      }));
    } catch (error: any) {
      console.error(`[flow:transfer] error: ${error?.message || error}`);
      return {
        success: false,
        events,
        error: error?.message || String(error),
      };
    }
  }, { ...options, actionType });

  printLog('flow', `transfer ${result.success ? 'succeeded' : 'failed'}`, {
    step: 'transfer',
    indent: 1,
  });

  return result;
}

export interface RecoveryFlowOptions {
  accountId: string;
}

export interface RecoveryFlowResult {
  success: boolean;
  error?: string;
  events: any[];
  raw?: any;
}

export async function recoverAccount(
  passkey: PasskeyFixture,
  options: RecoveryFlowOptions
): Promise<RecoveryFlowResult> {
  await passkey.setup();

  printLog('flow', `attempting recovery for ${options.accountId}`, {
    step: 'recovery',
  });

  const result = await passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const events: any[] = [];

    return utils.passkeyManager.recoverAccountFlow({
      accountId: args.accountId,
      options: {
        onEvent: (event: any) => {
          events.push(event);
          console.log(`[flow:recovery]   -> ${event.phase} | ${event.message}`);
        },
        onError: (error: any) => {
          console.error(`[flow:recovery] ! ${error}`);
        }
      }
    }).then((result: any) => ({
      success: !!result.success,
      error: result?.error,
      events,
      raw: result,
    })).catch((error: any) => ({
      success: false,
      error: error?.message || String(error),
      events,
    }));
  }, options);

  printLog('flow', `recovery ${result.success ? 'succeeded' : 'failed'}`, {
    step: 'recovery',
    indent: 1,
  });

  return result;
}
