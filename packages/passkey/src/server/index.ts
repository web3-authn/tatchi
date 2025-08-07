// Server package exports - Core NEAR Account Service
export * from './core/types';
export * from './core/config';
export {
  AuthService
} from './core/AuthService';
export {
  handleVerifyAuthenticationResponse,
  verifyAuthenticationMiddleware
} from './core/verifyAuthenticationHandler';