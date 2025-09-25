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
dotenv.config();

const config = {
  port: Number(process.env.PORT || 3000),
  expectedOrigin: process.env.EXPECTED_ORIGIN || 'https://example.localhost', // Frontend origin
  expectedWalletOrigin: process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost', // Wallet origin (optional)
};
// Create AuthService instance
// Optional grace keys: previously-active Shamir exponents still accepted for remove-server-lock
let graceShamirKeys: Array<{ e_s_b64u: string; d_s_b64u: string }> | undefined = undefined;
try {
  const raw = process.env.SHAMIR_GRACE_KEYS;
  if (raw) {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      graceShamirKeys = arr
        .filter((x) => x && typeof x.e_s_b64u === 'string' && typeof x.d_s_b64u === 'string')
        .map((x) => ({ e_s_b64u: x.e_s_b64u, d_s_b64u: x.d_s_b64u }));
    }
  }
} catch (e) {
  console.warn('[relay-server] Failed to parse SHAMIR_GRACE_KEYS env (ignored):', (e as Error)?.message);
}

const authService = new AuthService({
  // new accounts with be created with this account: e.g. bob.{relayer-account-id}.near
  // you can make it the same account as the webauthn contract id.
  relayerAccountId: process.env.RELAYER_ACCOUNT_ID!,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
  webAuthnContractId: 'web3-authn-v5.testnet',
  // Prefer env override; default to FastNEAR which is often more reliable for tests
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com',
  networkId: 'testnet',
  accountInitialBalance: '30000000000000000000000', // 0.03 NEAR
  createAccountAndRegisterGas: '85000000000000', // 80 TGas (tested)
  // Shamir 3-pass params (base64url bigints)
  shamir_p_b64u: process.env.SHAMIR_P_B64U!,
  shamir_e_s_b64u: process.env.SHAMIR_E_S_B64U!,
  shamir_d_s_b64u: process.env.SHAMIR_D_S_B64U!,
  graceShamirKeys,
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
});
