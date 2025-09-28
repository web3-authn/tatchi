import { BUILD_PATHS } from '../build-paths.js';

// === CONFIGURATION ===
export const SIGNER_WORKER_MANAGER_CONFIG = {
  TIMEOUTS: {
    DEFAULT: 60_000,      // 60s default fallback for worker operations
    TRANSACTION: 60_000,  // 60s for contract verification + signing
    REGISTRATION: 60_000, // 60s for registration operations
  },
  WORKER: {
    URL: BUILD_PATHS.RUNTIME.SIGNER_WORKER,
    TYPE: 'module' as const,
    NAME: 'Web3AuthnSignerWorker',
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    BACKOFF_MS: 1000,
  }
} as const;

// === DEVICE LINKING CONFIGURATION ===
export const DEVICE_LINKING_CONFIG = {
  TIMEOUTS: {
    QR_CODE_MAX_AGE_MS: 15 * 60 * 1000,        // 15 minutes - QR code expiration
    SESSION_EXPIRATION_MS: 15 * 60 * 1000,     // 15 minutes - Device linking session timeout
    TEMP_KEY_CLEANUP_MS: 15 * 60 * 1000,       // 15 minutes - Automatic cleanup of temporary keys
    POLLING_INTERVAL_MS: 3000,                 // 3 seconds - AddKey polling interval
    REGISTRATION_RETRY_DELAY_MS: 2000,         // 2 seconds - Delay between registration retries
  },
  RETRY: {
    MAX_REGISTRATION_ATTEMPTS: 5,              // Maximum registration retry attempts
  }
} as const;
