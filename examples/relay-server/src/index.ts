import express, { Express } from 'express';
import { AuthService } from '@tatchi/sdk/server';
import { createRelayRouter } from '@tatchi/sdk/server/router/express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: Number(process.env.PORT || 3000),
  expectedOrigin: process.env.EXPECTED_ORIGIN || 'https://example.localhost', // Frontend origin
  expectedWalletOrigin: process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost', // Wallet origin (optional)
  // minutes between automatic key rotations
  rotateEveryMinutes: Number(process.env.ROTATE_EVERY) || 60,
};
// Create AuthService instance
const authService = new AuthService({
  // new accounts with be created with this account: e.g. bob.{relayer-account-id}.near
  // you can make it the same account as the webauthn contract id.
  relayerAccountId: process.env.RELAYER_ACCOUNT_ID!,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
  webAuthnContractId: process.env.WEBAUTHN_CONTRACT_ID || 'w3a-v1.testnet',
  // Prefer env override; default to FastNEAR which is often more reliable for tests
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  networkId: 'testnet',
  accountInitialBalance: '30000000000000000000000', // 0.03 NEAR
  createAccountAndRegisterGas: '85000000000000', // 80 TGas (tested)
  // Shamir 3-pass params (base64url bigints)
  shamir: {
    shamir_p_b64u: process.env.SHAMIR_P_B64U!,
    shamir_e_s_b64u: process.env.SHAMIR_E_S_B64U!,
    shamir_d_s_b64u: process.env.SHAMIR_D_S_B64U!,
    graceShamirKeysFile: process.env.SHAMIR_GRACE_KEYS_FILE,
  },
});

const app: Express = express();
// Middleware
app.use(express.json());
const allowedOrigins = [config.expectedOrigin, config.expectedWalletOrigin].filter(Boolean);
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Mount standardized router built from AuthService
app.use('/', createRelayRouter(authService, { healthz: true }));

function startKeyRotationCronjob(intervalMinutes: number, service: AuthService) {
  const prefix = '[key-rotation-cron]';
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  let inFlight = false;

  const run = async () => {
    if (inFlight) {
      console.warn(`${prefix} previous rotation still running, skipping`);
      return;
    }
    inFlight = true;
    try {
      const rotation = await service.rotateShamirServerKeypair();
      console.log(`${prefix} rotated to newKeyId=${rotation.newKeyId ?? 'unknown'} (prev=${rotation.previousKeyId ?? 'none'})`);

      const graceKeyIds = [...rotation.graceKeyIds];
      if (graceKeyIds.length > 5) {
        const toRemove = graceKeyIds.slice(0, graceKeyIds.length - 5);
        for (const keyId of toRemove) {
          const response = await service.handleRemoveGraceKey({ keyId });
          const payload = JSON.parse(response.body) as { removed?: boolean };
          console.log(`${prefix} pruned grace key ${keyId}: ${payload.removed ? 'removed' : 'not found'}`);
        }
      }

      const listResponse = await service.handleListGraceKeys();
      const listPayload = JSON.parse(listResponse.body) as { graceKeyIds?: string[] };
      console.log(`${prefix} grace keys (max 5 retained):`, listPayload.graceKeyIds ?? []);
      console.log(`${prefix} remember to persist new e_s/d_s values externally for durability.`);
    } catch (error) {
      console.error(`${prefix} rotation failed:`, error);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(run, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`${prefix} scheduler started (every ${intervalMinutes} minutes). Running initial rotation now.`);
  void run();
}

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  console.log(`Expected Frontend Origin: ${config.expectedOrigin}`);

  authService.getRelayerAccount().then((relayer) => {
    console.log(`AuthService connected with relayer account: ${relayer.accountId}`)
  }).catch((err: Error) => {
    console.error("AuthService initial check failed (non-blocking server start):", err);
  });

  // schedule key rotation based on env (minutes)
  startKeyRotationCronjob(config.rotateEveryMinutes, authService);
});
