import { useMemo } from 'react';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import {
  AccountRecoveryPhase,
  AccountRecoveryStatus,
  type AccountRecoveryHooksOptions,
  type AccountRecoverySSEEvent,
  LoginPhase,
  LoginStatus,
  type LoginHooksOptions,
  type LoginSSEvent,
  RegistrationPhase,
  RegistrationStatus,
  type RegistrationHooksOptions,
  type RegistrationSSEEvent,
} from '@/core/types/sdkSentEvents';

export function useTatchiWithSdkFlow(args: {
  tatchi: TatchiPasskey;
  beginSdkFlow: (kind: 'login' | 'register' | 'recover', accountId?: string) => number;
  appendSdkEventMessage: (seq: number, message: string) => void;
  endSdkFlow: (kind: 'login' | 'register' | 'recover', seq: number, status: 'success' | 'error', error?: string) => void;
}): TatchiPasskey {
  const { tatchi, beginSdkFlow, appendSdkEventMessage, endSdkFlow } = args;

  return useMemo(() => {
    /**
     * We use a `Proxy` to instrument a few core flow entrypoints (login/register/recover)
     * while preserving the full `TatchiPasskey` API surface.
     *
     * This lets *all* callers (not just PasskeyAuthMenu) use `ctx.tatchi.*` directly and
     * still have `sdkFlow` update as events stream in.
     */
    type LoginAndCreateSessionFn = TatchiPasskey['loginAndCreateSession'];
    type RegisterPasskeyFn = TatchiPasskey['registerPasskey'];
    type RecoverAccountFlowFn = TatchiPasskey['recoverAccountFlow'];

    const loginAndCreateSessionWithSdkFlow: LoginAndCreateSessionFn = async (
      nearAccountId,
      options,
    ) => {
      const seq = beginSdkFlow('login', nearAccountId);
      const wrappedOptions: LoginHooksOptions = {
        ...options,
        onEvent: (event: LoginSSEvent) => {
          appendSdkEventMessage(seq, event.message);
          if (event.phase === LoginPhase.STEP_4_LOGIN_COMPLETE && event.status === LoginStatus.SUCCESS) {
            endSdkFlow('login', seq, 'success');
          } else if (event.phase === LoginPhase.LOGIN_ERROR || event.status === LoginStatus.ERROR) {
            const error = 'error' in event ? event.error : event.message;
            endSdkFlow('login', seq, 'error', error || event.message);
          }
          options?.onEvent?.(event);
        },
        onError: (error: Error) => {
          appendSdkEventMessage(seq, error.message);
          endSdkFlow('login', seq, 'error', error.message);
          options?.onError?.(error);
        },
      };

      return await tatchi.loginAndCreateSession(nearAccountId, wrappedOptions);
    };

    const registerPasskeyWithSdkFlow: RegisterPasskeyFn = async (
      nearAccountId,
      options,
    ) => {
      const seq = beginSdkFlow('register', nearAccountId);
      const wrappedOptions: RegistrationHooksOptions = {
        ...options,
        onEvent: (event: RegistrationSSEEvent) => {
          appendSdkEventMessage(seq, event.message);
          if (
            event.phase === RegistrationPhase.STEP_8_REGISTRATION_COMPLETE &&
            event.status === RegistrationStatus.SUCCESS
          ) {
            endSdkFlow('register', seq, 'success');
          } else if (event.phase === RegistrationPhase.REGISTRATION_ERROR || event.status === RegistrationStatus.ERROR) {
            const error = 'error' in event ? event.error : event.message;
            endSdkFlow('register', seq, 'error', error || event.message);
          }
          options?.onEvent?.(event);
        },
        onError: (error: Error) => {
          appendSdkEventMessage(seq, error.message);
          endSdkFlow('register', seq, 'error', error.message);
          options?.onError?.(error);
        },
      };

      return await tatchi.registerPasskey(nearAccountId, wrappedOptions);
    };

    const recoverAccountFlowWithSdkFlow: RecoverAccountFlowFn = async (args) => {
      const seq = beginSdkFlow('recover', args?.accountId);
      const options: AccountRecoveryHooksOptions | undefined = args?.options;

      const wrappedOptions: AccountRecoveryHooksOptions = {
        ...options,
        onEvent: (event: AccountRecoverySSEEvent) => {
          appendSdkEventMessage(seq, event.message);
          if (
            event.phase === AccountRecoveryPhase.STEP_5_ACCOUNT_RECOVERY_COMPLETE &&
            event.status === AccountRecoveryStatus.SUCCESS
          ) {
            endSdkFlow('recover', seq, 'success');
          } else if (event.phase === AccountRecoveryPhase.ERROR || event.status === AccountRecoveryStatus.ERROR) {
            const error = 'error' in event ? event.error : event.message;
            endSdkFlow('recover', seq, 'error', error || event.message);
          }
          options?.onEvent?.(event);
        },
        onError: (error: Error) => {
          appendSdkEventMessage(seq, error.message);
          endSdkFlow('recover', seq, 'error', error.message);
          options?.onError?.(error);
        },
      };

      return await tatchi.recoverAccountFlow({
        ...args,
        options: wrappedOptions,
      });
    };

    return new Proxy(tatchi, {
      get(target, prop, receiver) {
        if (prop === 'loginAndCreateSession') {
          return loginAndCreateSessionWithSdkFlow;
        }

        if (prop === 'registerPasskey') {
          return registerPasskeyWithSdkFlow;
        }

        if (prop === 'recoverAccountFlow') {
          return recoverAccountFlowWithSdkFlow;
        }

        const value: unknown = Reflect.get(target as object, prop, receiver);
        // For non-wrapped methods, bind to preserve `this` on the class instance.
        if (typeof value === 'function') return (value as (...args: unknown[]) => unknown).bind(target);
        return value;
      },
    });
  }, [appendSdkEventMessage, beginSdkFlow, endSdkFlow, tatchi]);
}

export default useTatchiWithSdkFlow;
