import express, { Express, Request, Response } from 'express';
import {
  AuthService,
  type CreateAccountAndRegisterRequest,
  type CreateAccountAndRegisterResult,
  type ShamirApplyServerLockResponse,
  type ShamirRemoveServerLockResponse,
} from '@web3authn/passkey/server';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
dotenv.config();

type RelayBootstrap = {
  authService?: Partial<ConstructorParameters<typeof AuthService>[0]> & {
    relayerAccountId: string;
    relayerPrivateKey: string;
    webAuthnContractId: string;
    shamir_p_b64u: string;
    shamir_e_s_b64u: string;
    shamir_d_s_b64u: string;
  };
  server?: {
    port?: number;
    expectedOrigin?: string;
    expectedWalletOrigin?: string;
    rotateEveryMinutes?: number;
  };
};

function loadBootstrapConfig(): RelayBootstrap | null {
  const inline = process.env.RELAY_CONFIG_JSON;
  if (inline && inline.trim().length) {
    try { return JSON.parse(inline); } catch {}
  }
  const filePath = process.env.RELAY_CONFIG_FILE;
  if (filePath && filePath.trim().length) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {}
  }
  return null;
}

const bootstrap = loadBootstrapConfig();

const config = {
  port: Number(bootstrap?.server?.port ?? process.env.PORT ?? 3000),
  expectedOrigin: bootstrap?.server?.expectedOrigin || process.env.EXPECTED_ORIGIN || 'https://example.localhost',
  expectedWalletOrigin: bootstrap?.server?.expectedWalletOrigin || process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost',
  rotateEveryMinutes: Number(bootstrap?.server?.rotateEveryMinutes ?? process.env.ROTATE_EVERY ?? 60),
};

// Create AuthService instance (prefer injected config over envs)
const authService = new AuthService({
  relayerAccountId: bootstrap?.authService?.relayerAccountId || process.env.RELAYER_ACCOUNT_ID!,
  relayerPrivateKey: bootstrap?.authService?.relayerPrivateKey || process.env.RELAYER_PRIVATE_KEY!,
  webAuthnContractId: bootstrap?.authService?.webAuthnContractId || 'web3-authn-v5.testnet',
  nearRpcUrl: bootstrap?.authService?.nearRpcUrl || process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  networkId: (bootstrap?.authService?.networkId as any) || 'testnet',
  accountInitialBalance: bootstrap?.authService?.accountInitialBalance || '30000000000000000000000',
  createAccountAndRegisterGas: bootstrap?.authService?.createAccountAndRegisterGas || '85000000000000',
  shamir: {
    shamir_p_b64u: bootstrap?.authService?.shamir?.shamir_p_b64u || process.env.SHAMIR_P_B64U!,
    shamir_e_s_b64u: bootstrap?.authService?.shamir?.shamir_e_s_b64u || process.env.SHAMIR_E_S_B64U!,
    shamir_d_s_b64u: bootstrap?.authService?.shamir?.shamir_d_s_b64u || process.env.SHAMIR_D_S_B64U!,
    graceShamirKeysFile: (bootstrap?.authService?.shamir as any)?.graceShamirKeysFile || process.env.SHAMIR_GRACE_KEYS_FILE,
    graceShamirKeys: (bootstrap?.authService?.shamir as any)?.graceShamirKeys,
  },
});

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
// Global error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error(err.stack);
  res.status(500).send('Internal AuthService error');
});

// Account creation route
app.post(
  '/create_account_and_register_user',
  async (req: Request<CreateAccountAndRegisterRequest>, res: Response<CreateAccountAndRegisterResult>) => {
    try {
      const {
        new_account_id,
        new_public_key,
        vrf_data,
        webauthn_registration,
        deterministic_vrf_public_key,
        authenticator_options
      } = req.body;

      // Validate required parameters
      if (!new_account_id || typeof new_account_id !== 'string') {
        throw new Error('Missing or invalid new_account_id');
      }
      if (!new_public_key || typeof new_public_key !== 'string') {
        throw new Error('Missing or invalid new_public_key');
      }
      if (!vrf_data || typeof vrf_data !== 'object') {
        throw new Error('Missing or invalid vrf_data');
      }
      if (!webauthn_registration || typeof webauthn_registration !== 'object') {
        throw new Error('Missing or invalid webauthn_registration');
      }

      // Call the atomic contract function via accountService
      const result = await authService.createAccountAndRegisterUser({
        new_account_id,
        new_public_key,
        vrf_data,
        webauthn_registration,
        deterministic_vrf_public_key,
        authenticator_options
      });

      // Return the result directly - don't throw if unsuccessful
      if (result.success) {
        res.status(200).json(result);
      } else {
        // Return error response with appropriate HTTP status code
        console.error('account creation and registration failed:', result.error);
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('account creation and registration failed:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown server error'
      });
    }
  }
);

// Removed legacy SRA routes

// Shamir 3-pass endpoints
app.post('/vrf/apply-server-lock', async (req: Request<{}, {}, { kek_c_b64u: string }>, res: Response<ShamirApplyServerLockResponse | { error: string; details?: string }>) => {
  try {
    console.log("apply-server-lock request.body", req.body);
    const serverResponse = await authService.handleApplyServerLock({
      body: req.body
    });

    Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
    res.status(serverResponse.status);
    res.send(JSON.parse(serverResponse.body));

  } catch (e: any) {
    res.status(500).json({
      error: 'internal',
      details: e?.message
    });
  }
});

app.post('/vrf/remove-server-lock', async (req: Request<{}, {}, { kek_cs_b64u: string; keyId: string }>, res: Response<ShamirRemoveServerLockResponse | { error: string; details?: string }>) => {
  try {
    console.log("remove-server-lock request.body", req.body);
    const serverResponse = await authService.handleRemoveServerLock({
      body: req.body
    });

    Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
    res.status(serverResponse.status);
    res.send(JSON.parse(serverResponse.body));

  } catch (e: any) {
    res.status(500).json({
      error: 'internal',
      details: e?.message
    });
  }
});

// Shamir key info endpoint (for proactive client refresh)
app.get('/shamir/key-info', async (_req: Request, res: Response) => {
  try {
    const serverResponse = await authService.handleGetShamirKeyInfo();
    Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
    res.status(serverResponse.status);
    res.send(JSON.parse(serverResponse.body));
  } catch (e: any) {
    res.status(500).json({ error: 'internal', details: e?.message });
  }
});

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
