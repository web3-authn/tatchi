import express, { Express } from 'express';
import {
  AuthService,
  SessionService,
  handleListGraceKeys,
  handleRemoveGraceKey,
  type AuthServiceConfig,
} from '@tatchi-xyz/sdk/server';
import { createRelayRouter } from '@tatchi-xyz/sdk/server/router/express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type DemoJwtClaims = {
  sub: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  rpId?: string;
  blockHeight?: number;
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

function parseBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function requireEnv(name: string): string {
  const v = String(process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const config = {
  port: Number(process.env.PORT || 3000),
  expectedOrigin: process.env.EXPECTED_ORIGIN || 'https://example.localhost', // Frontend origin
  expectedWalletOrigin: process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost', // Wallet origin (optional)
  enableRotation: parseBool(process.env.ENABLE_ROTATION),
  // minutes between automatic key rotations
  rotateEveryMinutes: Number(process.env.ROTATE_EVERY) || 60,
};

const shamirConfig = (() => {
  const p = String(process.env.SHAMIR_P_B64U || '').trim();
  const e = String(process.env.SHAMIR_E_S_B64U || '').trim();
  const d = String(process.env.SHAMIR_D_S_B64U || '').trim();
  const anyProvided = Boolean(p || e || d || process.env.SHAMIR_GRACE_KEYS_FILE);
  if (!anyProvided) return undefined;
  if (!p || !e || !d) {
    throw new Error('Shamir enabled but SHAMIR_P_B64U / SHAMIR_E_S_B64U / SHAMIR_D_S_B64U are not all set');
  }
  return {
    shamir_p_b64u: p,
    shamir_e_s_b64u: e,
    shamir_d_s_b64u: d,
    graceShamirKeysFile: process.env.SHAMIR_GRACE_KEYS_FILE,
  };
})();

const zkEmailProverBaseUrl = String(process.env.ZK_EMAIL_PROVER_BASE_URL || '').trim();

// Create AuthService instance
const authServiceConfig: AuthServiceConfig = {
  // new accounts with be created with this account: e.g. bob.{relayer-account-id}.near
  // you can make it the same account as the webauthn contract id.
  relayerAccountId: requireEnv('RELAYER_ACCOUNT_ID'),
  relayerPrivateKey: requireEnv('RELAYER_PRIVATE_KEY'),
  webAuthnContractId: process.env.WEBAUTHN_CONTRACT_ID || 'w3a-v1.testnet',
  // Prefer env override; default to FastNEAR which is often more reliable for tests
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  networkId: 'testnet',
  accountInitialBalance: '40000000000000000000000', // 0.04 NEAR
  createAccountAndRegisterGas: '85000000000000', // 85 TGas (tested)
  zkEmailProver: zkEmailProverBaseUrl
    ? {
        baseUrl: zkEmailProverBaseUrl,
        timeoutMs: Number(process.env.ZK_EMAIL_PROVER_TIMEOUT_MS || 0) || undefined,
      }
    : undefined,
  shamir: shamirConfig,
};
const authService = new AuthService(authServiceConfig);

const session = (() => {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret) return null;

  const issuer = (process.env.JWT_ISSUER || 'relay-server').trim();
  const audience = (process.env.JWT_AUDIENCE || 'tatchi-app').trim();
  const expiresIn = Number(process.env.JWT_EXPIRES_SEC || 24 * 60 * 60);
  const cookieName = (process.env.SESSION_COOKIE_NAME || 'w3a_session').trim();

  return new SessionService<DemoJwtClaims>({
    jwt: {
      signToken: ({ payload }: { header: Record<string, unknown>; payload: Record<string, unknown> }) =>
        jwt.sign(payload as any, secret, {
          algorithm: 'HS256',
          issuer,
          audience,
          expiresIn,
        }),
      verifyToken: async (token: string): Promise<{ valid: boolean; payload?: DemoJwtClaims }> => {
        try {
          const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience }) as DemoJwtClaims;
          return { valid: true, payload };
        } catch {
          return { valid: false };
        }
      },
    },
    cookie: { name: cookieName },
  });
})();

const app: Express = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  const requestId = incoming || crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use((_req, res, next) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Middleware (JSON API only)
app.use(express.json({ limit: '5mb' }));

const allowedOrigins = [config.expectedOrigin, config.expectedWalletOrigin];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    // Email recovery routing
    'X-Email-Recovery-Mode',
    'X-Recovery-Mode',
    'X-NEAR-Account-Id',
    'X-Account-Id',
  ]
}));

// Mount standardized router built from AuthService
app.use('/', createRelayRouter(authService, {
  healthz: true,
  readyz: true,
  session
}));

// Minimal /signed-delegate route for NEP-461 delegate actions.
// Expects { hash, signedDelegate } in the JSON body and forwards to AuthService.
app.options('/signed-delegate', (_req, res) => {
  res.sendStatus(204);
});

app.post('/signed-delegate', async (req, res) => {
  try {
    const { hash, signedDelegate } = req.body || {};
    if (typeof hash !== 'string' || !hash || !signedDelegate) {
      res.status(400).json({ ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' });
      return;
    }

    const result = await authService.executeSignedDelegate({
      hash,
      signedDelegate,
    });

    if (!result || !result.ok) {
      res.status(400).json({
        ok: false,
        code: result?.code || 'delegate_execution_failed',
        message: result?.error || 'Failed to execute delegate action',
      });
      return;
    }

    res.status(200).json({
      ok: true,
      relayerTxHash: result.transactionHash || null,
      status: 'submitted',
      outcome: result.outcome ?? null,
    });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      code: 'internal',
      message: e?.message || 'Internal error while executing delegate action',
    });
  }
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
      const shamir = service.shamirService;
      if (!shamir || !shamir.hasShamir()) {
        console.warn(`${prefix} Shamir not configured; skipping rotation`);
        return;
      }
      const rotation = await shamir.rotateShamirServerKeypair();
      console.log(`${prefix} rotated to newKeyId=${rotation.newKeyId ?? 'unknown'} (prev=${rotation.previousKeyId ?? 'none'})`);

      const graceKeyIds = [...rotation.graceKeyIds];
      if (graceKeyIds.length > 5) {
        const toRemove = graceKeyIds.slice(0, graceKeyIds.length - 5);
        for (const keyId of toRemove) {
          const response = await handleRemoveGraceKey(shamir, { keyId });
          const payload = JSON.parse(response.body) as { removed?: boolean };
          console.log(`${prefix} pruned grace key ${keyId}: ${payload.removed ? 'removed' : 'not found'}`);
        }
      }

      const listResponse = await handleListGraceKeys(shamir);
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

const server = app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  console.log(`Expected Frontend Origin: ${config.expectedOrigin}`);

  authService.getRelayerAccount().then((relayer) => {
    console.log(`AuthService connected with relayer account: ${relayer.accountId}`)
  }).catch((err: Error) => {
    console.error("AuthService initial check failed (non-blocking server start):", err);
  });

  if (config.enableRotation) {
    startKeyRotationCronjob(config.rotateEveryMinutes, authService);
  } else {
    console.log('[key-rotation-cron] disabled (set ENABLE_ROTATION=1 to enable)');
  }
});

function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, closing server...`);
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
