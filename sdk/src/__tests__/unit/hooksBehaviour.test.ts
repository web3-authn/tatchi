import { test, expect } from '@playwright/test';
import type { AfterCall } from '../../core/types/passkeyManager';

// Simulates the SDK hook semantics used across TatchiPasskey and the Iframe proxy.
async function simulateOperation<T>({
  op,
  afterCall,
  onError,
}: {
  op: () => Promise<T>;
  afterCall?: AfterCall<T>;
  onError?: (e: Error) => void | Promise<void>;
}): Promise<T> {
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

test.describe('Hooks behaviour (afterCall/onError)', () => {
  test('success path: calls afterCall(true, result); does not call onError', async () => {
    const calls: string[] = [];
    const onError = () => { calls.push('onError'); };
    let afterArgs: { success: boolean; result?: number } | null = null;
    const afterCall: AfterCall<number> = (success: boolean, result?: number) => {
      calls.push('after');
      afterArgs = { success, result };
    };

    const result = await simulateOperation<number>({
      op: async () => 42,
      afterCall,
      onError,
    });

    expect(result).toBe(42);
    expect(calls).toEqual(['after']);
    expect(afterArgs).toEqual({ success: true, result: 42 });
  });

  test('error path: calls onError(e) and afterCall(false) without result', async () => {
    const calls: string[] = [];
    let seenError: string | null = null;
    const onError = (e: Error) => { calls.push('onError'); seenError = e.message; };
    let afterArgs: { success: boolean; hasResult: boolean } | null = null;
    const afterCall: AfterCall<number> = (success: boolean, result?: number) => {
      calls.push('after');
      afterArgs = { success, hasResult: typeof result !== 'undefined' };
    };

    await expect(simulateOperation<number>({
      op: async () => { throw new Error('boom'); },
      afterCall,
      onError,
    })).rejects.toThrow('boom');

    expect(calls).toEqual(['onError', 'after']);
    expect(seenError).toBe('boom');
    expect(afterArgs).toEqual({ success: false, hasResult: false });
  });
});
