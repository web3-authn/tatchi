// Barrel re-exports (kept for low churn)
export {
  parseTransactionSummary,
  sanitizeForPostMessage,
  ERROR_MESSAGES,
  sendConfirmResponse,
  isUserCancelledSecureConfirm,
} from '../adapters/common';
export {
  getNearAccountId,
  getTxCount,
  getIntentDigest,
  getSignTransactionPayload,
  getRegisterAccountPayload,
} from '../adapters/requestHelpers';
export { fetchNearContext, releaseReservedNonces } from '../adapters/near';
export { maybeRefreshVrfChallenge } from '../adapters/vrf';
export { renderConfirmUI, closeModalSafely } from '../adapters/ui';
export { collectAuthenticationCredentialWithPRF } from '../adapters/webauthn';
