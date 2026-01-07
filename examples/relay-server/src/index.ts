import express, { Express } from 'express';
import {
  AuthService,
  parseBool,
  requireEnvVar,
  createThresholdEd25519ServiceFromAuthService,
} from '@tatchi-xyz/sdk/server';
import { createRelayRouter, startKeyRotationCronjob } from '@tatchi-xyz/sdk/server/router/express';

import dotenv from 'dotenv';
import jwtSession from './jwtSession.js';

dotenv.config();
const env = process.env;
const config = {
  port: Number(env.PORT || 3000),
  expectedOrigin: env.EXPECTED_ORIGIN || 'https://example.localhost', // Frontend origin
  expectedWalletOrigin: env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost', // Wallet origin (optional)
  enableRotation: parseBool(env.ENABLE_ROTATION),
  rotateEveryMinutes: Number(env.ROTATE_EVERY) || 60, // minutes between automatic key rotations
};

const thresholdEd25519KeyStore = {
  // Share mode + deterministic relayer share derivation (optional)
  THRESHOLD_ED25519_SHARE_MODE: env.THRESHOLD_ED25519_SHARE_MODE,
  THRESHOLD_ED25519_MASTER_SECRET_B64U: env.THRESHOLD_ED25519_MASTER_SECRET_B64U,
  // Optional persistence for sessions/shares (recommended for prod)
  UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN,
  REDIS_URL: env.REDIS_URL,
  // Optional key prefixes (useful when sharing a Redis instance)
  THRESHOLD_ED25519_KEYSTORE_PREFIX: env.THRESHOLD_ED25519_KEYSTORE_PREFIX,
  THRESHOLD_ED25519_SESSION_PREFIX: env.THRESHOLD_ED25519_SESSION_PREFIX,
  THRESHOLD_ED25519_AUTH_PREFIX: env.THRESHOLD_ED25519_AUTH_PREFIX,
} as const;

const authService = new AuthService({
  // new accounts with be created with this account: e.g. bob.{relayer-account-id}.near
  // you can make it the same account as the webauthn contract id.
  relayerAccountId: requireEnvVar(env, 'RELAYER_ACCOUNT_ID'),
  relayerPrivateKey: requireEnvVar(env, 'RELAYER_PRIVATE_KEY'),
  webAuthnContractId: env.WEBAUTHN_CONTRACT_ID || 'w3a-v1.testnet',
  // Optional overrides (SDK provides defaults when omitted)
  nearRpcUrl: env.NEAR_RPC_URL,
  networkId: env.NETWORK_ID,
  accountInitialBalance: env.ACCOUNT_INITIAL_BALANCE,
  createAccountAndRegisterGas: env.CREATE_ACCOUNT_AND_REGISTER_GAS,
  logger: console,
  thresholdEd25519KeyStore,
  shamir: {
    SHAMIR_P_B64U: env.SHAMIR_P_B64U,
    SHAMIR_E_S_B64U: env.SHAMIR_E_S_B64U,
    SHAMIR_D_S_B64U: env.SHAMIR_D_S_B64U,
    SHAMIR_GRACE_KEYS_FILE: env.SHAMIR_GRACE_KEYS_FILE,
  },
  zkEmailProver: {
    ZK_EMAIL_PROVER_BASE_URL: env.ZK_EMAIL_PROVER_BASE_URL,
    ZK_EMAIL_PROVER_TIMEOUT_MS: env.ZK_EMAIL_PROVER_TIMEOUT_MS,
  },
});

const threshold = createThresholdEd25519ServiceFromAuthService({
  authService,
  thresholdEd25519KeyStore,
  logger: console,
});

const app: Express = express();

app.use((_req, res, next) => {
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(express.json({ limit: '1mb' }));

// Mount router built from AuthService
app.use('/', createRelayRouter(authService, {
  healthz: true,
  readyz: true,
  corsOrigins: [config.expectedOrigin, config.expectedWalletOrigin],
  signedDelegate: { route: '/signed-delegate' },
  session: jwtSession,
  threshold,
  logger: console,
}));

const server = app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  console.log(`Expected Frontend Origin: ${config.expectedOrigin}`);
  authService.getRelayerAccount()
    .then(relayer => console.log(`AuthService started with relayer account: ${relayer.accountId}`))
    .catch((err: Error) => console.error("AuthService initial check failed:", err));
});

// Optional Shamir3Pass key rotation
const rotationCron = startKeyRotationCronjob(authService, {
  enabled: config.enableRotation,
  intervalMinutes: config.rotateEveryMinutes,
  maxGraceKeys: 5,
  logger: console,
});
if (!config.enableRotation) {
  console.log('[key-rotation-cron] disabled (set ENABLE_ROTATION=1 to enable)');
}

function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, closing server...`);
  rotationCron.stop();
  server.close(() => {
    console.log('[shutdown] http server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[shutdown] force exit after 10s');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
