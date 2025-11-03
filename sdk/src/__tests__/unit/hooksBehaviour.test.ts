import { test, expect } from '@playwright/test';
import type { BeforeCall, AfterCall } from '../../core/types/passkeyManager';

// Simulates the SDK hook semantics used across PasskeyManager and the Iframe proxy.
async function simulateOperation<T>({
  op,
  beforeCall,
  afterCall,
  onError,
}: {
  op: () => Promise<T>;
  beforeCall?: BeforeCall;
  afterCall?: AfterCall<T>;
  onError?: (e: Error) => void | Promise<void>;
}): Promise<T> {
  // Note: beforeCall exceptions are intentionally NOT caught by the SDK.
  await beforeCall?.();
  try {
    const res = await op();
    await afterCall?.(true, res);
    return res;
  } catch (err: any) {
    const e = err instanceof Error ? err : new Error(String(err));
    await onError?.(e);
    await afterCall?.(false);
    throw e;
  }
}

test.describe('Hooks behaviour (afterCall/onError/beforeCall)', () => {
  test('success path: calls beforeCall then afterCall(true, result); does not call onError', async () => {
    const calls: string[] = [];
    const beforeCall = () => { calls.push('before'); };
    const onError = () => { calls.push('onError'); };
    let afterArgs: { success: boolean; result?: number } | null = null;
    const afterCall: AfterCall<number> = (success: boolean, result?: number) => {
      calls.push('after');
      afterArgs = { success, result };
    };

    const result = await simulateOperation<number>({
      op: async () => 42,
      beforeCall,
      afterCall,
      onError,
    });

    expect(result).toBe(42);
    expect(calls).toEqual(['before', 'after']);
    expect(afterArgs).toEqual({ success: true, result: 42 });
  });

  test('error path: calls beforeCall, then onError(e) and afterCall(false) without result', async () => {
    const calls: string[] = [];
    const beforeCall = () => { calls.push('before'); };
    let seenError: string | null = null;
    const onError = (e: Error) => { calls.push('onError'); seenError = e.message; };
    let afterArgs: { success: boolean; hasResult: boolean } | null = null;
    const afterCall: AfterCall<number> = (success: boolean, result?: number) => {
      calls.push('after');
      afterArgs = { success, hasResult: typeof result !== 'undefined' };
    };

    await expect(simulateOperation<number>({
      op: async () => { throw new Error('boom'); },
      beforeCall,
      afterCall,
      onError,
    })).rejects.toThrow('boom');

    expect(calls).toEqual(['before', 'onError', 'after']);
    expect(seenError).toBe('boom');
    expect(afterArgs).toEqual({ success: false, hasResult: false });
  });

  test('beforeCall exceptions bubble (no onError/afterCall invoked by SDK)', async () => {
    const calls: string[] = [];
    const beforeCall = () => { calls.push('before'); throw new Error('pre'); };
    const onError = () => { calls.push('onError'); };
    const afterCall: AfterCall<number> = (_success: boolean, _result?: number) => { calls.push('after'); };

    await expect(simulateOperation<number>({
      op: async () => 1,
      beforeCall,
      afterCall,
      onError,
    })).rejects.toThrow('pre');

    // Only beforeCall should have run; SDK does not swallow or route this error.
    expect(calls).toEqual(['before']);
  });
});
