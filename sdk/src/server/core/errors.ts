import type { FinalExecutionOutcome } from '@near-js/types';
import type { NearExecutionFailure, NearReceiptOutcomeWithId } from './types';
import { isObject, isString } from '@/utils/validation';

/**
 * Parse a NEAR FinalExecutionOutcome and surface a human-readable error
 * string when common contract/account failures are detected.
 *
 * This helper is intentionally conservative: it never throws, and returns
 * null when it cannot confidently extract a useful message.
 */
export function parseContractExecutionError(
  result: FinalExecutionOutcome,
  accountId: string,
): string | null {
  try {
    // Check main transaction status
    if (result.status && isObject(result.status) && 'Failure' in result.status) {
      console.log(`Transaction failed:`, (result.status as any).Failure);
      return `Transaction failed: ${JSON.stringify((result.status as any).Failure)}`;
    }

    // Check receipts for failures
    const receipts = (result.receipts_outcome || []) as NearReceiptOutcomeWithId[];
    for (const receipt of receipts) {
      const status = receipt.outcome?.status;

      if ((status as any)?.Failure) {
        const failure: NearExecutionFailure = (status as any).Failure;
        console.log(`Receipt failure detected:`, failure);

        if (failure.ActionError?.kind) {
          const actionKind = failure.ActionError.kind;

          if ((actionKind as any).AccountAlreadyExists) {
            const info = (actionKind as any).AccountAlreadyExists;
            return `Account ${info.accountId ?? info.account_id ?? accountId} already exists on NEAR network`;
          }

          if ((actionKind as any).AccountDoesNotExist) {
            const info = (actionKind as any).AccountDoesNotExist;
            return `Referenced account ${info.account_id ?? accountId} does not exist`;
          }

          if ((actionKind as any).InsufficientStake) {
            const stakeInfo = (actionKind as any).InsufficientStake;
            return `Insufficient stake for account creation: ${stakeInfo.account_id ?? accountId}`;
          }

          if ((actionKind as any).LackBalanceForState) {
            const balanceInfo = (actionKind as any).LackBalanceForState;
            return `Insufficient balance for account state: ${balanceInfo.account_id ?? accountId}`;
          }

          // Common integration issue: Outlayer changed `request_execution` arg name from `code_source` → `source`.
          const executionError = (actionKind as any)?.FunctionCallError?.ExecutionError;
          if (typeof executionError === 'string' && executionError.includes('missing field `source`')) {
            return 'Contract input JSON is missing required field `source` (Outlayer `request_execution` expects `source`, not legacy `code_source`).';
          }

          return `Account creation failed: ${JSON.stringify(actionKind)}`;
        }

        return `Contract execution failed: ${JSON.stringify(failure)}`;
      }

      // Check logs for error keywords
      const logs = receipt.outcome?.logs || [];
      for (const log of logs) {
        if (isString(log)) {
          if (log.includes('AccountAlreadyExists') || log.includes('account already exists')) {
            return `Account ${accountId} already exists`;
          }
          if (log.includes('AccountDoesNotExist')) {
            return `Referenced account does not exist`;
          }
          if (log.includes('Cannot deserialize the contract state')) {
            return `Contract state deserialization failed. This may be due to a contract upgrade. Please try again or contact support.`;
          }
          if (log.includes('GuestPanic')) {
            return `Contract execution panic: ${log}`;
          }
        }
      }
    }

    return null;
  } catch (parseError: any) {
    console.warn(`Error parsing contract execution results:`, parseError);
    return null;
  }
}
