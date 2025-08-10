// Server package exports - Core NEAR Account Service
export * from './core/types';
export * from './core/config';
export {
  AuthService
} from './core/AuthService';
export {
  handleVerifyAuthenticationResponse,
  verifyAuthenticationMiddleware,
} from './core/verifyAuthenticationHandler';
export {
  Shamir3PassUtils,
  getShamirPB64uFromWasm,
  SHAMIR_P_B64U,
} from './core/shamirWorker';
export {
  type ShamirApplyServerLockRequest,
  type ShamirApplyServerLockResponse,
  type ShamirRemoveServerLockRequest,
  type ShamirRemoveServerLockResponse,
} from './core/types';