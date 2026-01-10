import type { PasskeyFixture } from './fixtures';
import type { TestUtils } from './index';
import { printLog } from './logging';
import { ActionType } from '../../core/types/actions';
import type { Page } from '@playwright/test';

export async function clickWalletIframeConfirm(page: Page, opts?: { timeoutMs?: number }): Promise<boolean> {
  const timeoutMs = Math.max(250, Math.floor(opts?.timeoutMs ?? 15_000));
  try {
    const iframeEl = page.locator('iframe[allow*="publickey-credentials-get"]').first();
    await iframeEl.waitFor({ state: 'attached', timeout: timeoutMs }).catch(() => undefined);
    const frame = await iframeEl.contentFrame();
    if (!frame) return false;

    const confirmBtn = frame.locator('#w3a-confirm-portal button.confirm').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: timeoutMs });
    await confirmBtn.click({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function autoConfirmWalletIframeUntil<T>(
  page: Page,
  task: Promise<T>,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<T> {
  const timeoutMs = Math.max(250, Math.floor(opts?.timeoutMs ?? 55_000));
  const intervalMs = Math.max(50, Math.floor(opts?.intervalMs ?? 250));

  let done = false;

  const loop = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (!done && Date.now() < deadline) {
      try {
        await clickWalletIframeConfirm(page, { timeoutMs: Math.min(500, intervalMs) });
      } catch { }
      try {
        await page.waitForTimeout(intervalMs);
      } catch { }
    }
  })();

  try {
    return await task;
  } finally {
    done = true;
    await loop.catch(() => undefined);
  }
}

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

  const registrationPromise = passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const toAccountId = (window as any).toAccountId ?? ((id: string) => id);
    const events: any[] = [];

    const confirmVariant = args.confirmVariant ?? 'skip';
    const overrides = (utils.confirmOverrides ?? {}) as Record<string, any>;
    const defaultConfirm = { uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' };
    const confirmConfig = overrides[confirmVariant] ?? overrides.skip ?? defaultConfirm;

    try {
      console.log(`[flow:register] invoking registerPasskeyInternal for ${args.accountId}`);
      return utils.tatchi.registerPasskeyInternal(toAccountId(args.accountId), {
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

  // Registration in a cross-origin wallet iframe requires a user activation.
  // confirmTxFlow enforces requireClick; provide the click from Playwright while
  // the browser-side registration promise is pending.
  const clickPromise = clickWalletIframeConfirm(passkey.page, { timeoutMs: 20_000 });
  await Promise.race([registrationPromise.then(() => undefined), clickPromise]);

  const registrationResult = await registrationPromise;

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

export async function loginAndCreateSession(
  passkey: PasskeyFixture,
  options: LoginFlowOptions
): Promise<LoginFlowResult> {
  await passkey.setup();

  const accountId = options.accountId;
  printLog('flow', `starting login for ${accountId}`, { step: 'login' });

  const loginPromise = passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const toAccountId = (window as any).toAccountId ?? ((id: string) => id);
    const events: any[] = [];

    try {
      console.log(`[flow:login] invoking loginAndCreateSession for ${args.accountId}`);
      return utils.tatchi.loginAndCreateSession(toAccountId(args.accountId), {
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

  const clickPromise = clickWalletIframeConfirm(passkey.page, { timeoutMs: 20_000 });
  await Promise.race([loginPromise.then(() => undefined), clickPromise]);

  const loginResult = await loginPromise;

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

  const resultPromise = passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const toAccountId = (window as any).toAccountId ?? ((id: string) => id);
    const events: any[] = [];

    try {
      console.log(`[flow:transfer] executing action for ${args.accountId}`);
      return utils.tatchi.executeAction({
        nearAccountId: toAccountId(args.accountId),
        receiverId: args.receiverId,
        actionArgs: {
          type: args.actionType ?? 'Transfer',
          amount: args.amountYocto,
        },
	        options: {
	          signerMode: { mode: 'local-signer' },
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

  const clickPromise = clickWalletIframeConfirm(passkey.page, { timeoutMs: 20_000 });
  await Promise.race([resultPromise.then(() => undefined), clickPromise]);

  const result = await resultPromise;

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

  const resultPromise = passkey.withTestUtils((args) => {
    const utils = (window as any).testUtils as TestUtils;
    const events: any[] = [];

    return utils.tatchi.recoverAccountFlow({
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

  const clickPromise = clickWalletIframeConfirm(passkey.page, { timeoutMs: 20_000 });
  await Promise.race([resultPromise.then(() => undefined), clickPromise]);

  const result = await resultPromise;

  printLog('flow', `recovery ${result.success ? 'succeeded' : 'failed'}`, {
    step: 'recovery',
    indent: 1,
  });

  return result;
}
