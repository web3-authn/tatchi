import { test, expect } from '@playwright/test';
import { parseContractExecutionError } from '../../server/core/errors';

test.describe('parseContractExecutionError()', () => {
  test.beforeEach(() => {
    // This helper currently logs when it detects failures; silence for unit tests.
    (console as any).__orig_log = console.log;
    console.log = () => { };
  });

  test.afterEach(() => {
    const orig = (console as any).__orig_log;
    if (typeof orig === 'function') console.log = orig;
    delete (console as any).__orig_log;
  });

  test('surfaces top-level transaction Failure', async () => {
    const out = parseContractExecutionError({ status: { Failure: { any: 'err' } }, receipts_outcome: [] } as any, 'bob.testnet');
    expect(out).toContain('Transaction failed');
  });

  test('maps AccountAlreadyExists action error', async () => {
    const result = {
      status: { SuccessValue: '' },
      receipts_outcome: [
        {
          id: 'r1',
          outcome: {
            logs: [],
            status: {
              Failure: {
                ActionError: {
                  kind: { AccountAlreadyExists: { accountId: 'bob.testnet' } },
                  index: '0',
                },
              },
            },
          },
        },
      ],
    } as any;
    const out = parseContractExecutionError(result, 'bob.testnet');
    expect(out).toContain('already exists');
  });

  test('maps GuestPanic in logs', async () => {
    const result = {
      status: { SuccessValue: '' },
      receipts_outcome: [
        { id: 'r1', outcome: { logs: ['GuestPanic: oops'], status: { SuccessValue: '' } } },
      ],
    } as any;
    const out = parseContractExecutionError(result, 'bob.testnet');
    expect(out).toContain('panic');
  });
});
