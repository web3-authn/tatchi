// Server package exports - Core NEAR Account Service
export * from './core/types';
export * from './core/config';
export * from './core/defaultConfigsServer';
export {
  AuthService
} from './core/AuthService';
export { SessionService, parseCsvList, buildCorsOrigins } from './core/SessionService';
export type { SessionConfig } from './core/SessionService';
// Note: Express router is exported via a separate subpath to avoid forcing
// consumers to install Express unless they explicitly opt in.
export {
  handleVerifyAuthenticationResponse,
  verifyAuthenticationMiddleware,
} from './core/verifyAuthenticationHandler';
export {
  Shamir3PassUtils,
  getShamirPB64uFromWasm,
  SHAMIR_P_B64U,
} from './core/shamirWorker';
export { ShamirService } from './core/ShamirService';
export {
  ThresholdSigningService,
  createThresholdSigningService,
  createThresholdEd25519KeyStore,
  createThresholdEd25519SessionStore,
} from './core/ThresholdService';
export type {
  ThresholdEd25519KeyStore,
  ThresholdEd25519KeyRecord,
  ThresholdEd25519SessionStore,
  ThresholdEd25519MpcSessionRecord,
  ThresholdEd25519SigningSessionRecord,
  ThresholdEd25519Commitments,
} from './core/ThresholdService';
export {
  handleApplyServerLock,
  handleRemoveServerLock,
  handleGetShamirKeyInfo,
  handleListGraceKeys,
  handleAddGraceKey,
  handleRemoveGraceKey,
} from './core/shamirHandlers';
export {
  type ShamirApplyServerLockRequest,
  type ShamirApplyServerLockResponse,
  type ShamirRemoveServerLockRequest,
  type ShamirRemoveServerLockResponse,
} from './core/types';
export * from './email-recovery';
