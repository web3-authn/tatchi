import React from 'react';
import type { SDKFlowRuntime } from '../../../types';

/*
 * Feeds SDK events to the PasskeyAuthMenu so that we can display SDk events
 * When registering accounts, syncing accounts, logging in, etc
 */

type FlowKind = Exclude<SDKFlowRuntime['kind'], null>;
type Handler = (() => void | Promise<unknown>) | undefined;

export function useSDKEvents(args: {
  sdkFlow: SDKFlowRuntime;
}): {
  withSdkEventsHandler: (kind: FlowKind, handler: Handler, timeoutMs: number) => (() => Promise<void>) | undefined;
} {
  const { sdkFlow } = args;

  const withSdkEventsHandler = React.useCallback(
    (kind: FlowKind, handler: Handler, timeoutMs: number) => {
      if (!handler) return undefined;
      return async () => {
        const seqBefore = sdkFlow.seq;
        const res = handler();
        if (res && typeof res.then === 'function') {
          await res;
        }
        await sdkFlow.awaitNextCompletion(kind, seqBefore, 500, timeoutMs);
      };
    },
    [sdkFlow],
  );

  return { withSdkEventsHandler };
}

export default useSDKEvents;
