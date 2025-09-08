import express from 'express';
import { AuthService, } from '@web3authn/passkey/server';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
const config = {
    port: Number(process.env.PORT || 3000),
    expectedOrigin: process.env.EXPECTED_ORIGIN || 'https://example.localhost', // Frontend origin
    expectedWalletOrigin: process.env.EXPECTED_WALLET_ORIGIN || 'https://wallet.example.localhost', // Wallet origin (optional)
};
// Create AuthService instance
const authService = new AuthService({
    // new accounts with be created with this account: e.g. bob.{relayer-account-id}.near
    // you can make it the same account as the webauthn contract id.
    relayerAccountId: process.env.RELAYER_ACCOUNT_ID,
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
    webAuthnContractId: 'web3-authn-v5.testnet',
    nearRpcUrl: 'https://rpc.testnet.near.org',
    // nearRpcUrl: 'https://test.rpc.fastnear.com'
    networkId: 'testnet',
    accountInitialBalance: '30000000000000000000000', // 0.03 NEAR
    createAccountAndRegisterGas: '45000000000000', // 45 TGas (tested)
    // Shamir 3-pass params (base64url bigints)
    shamir_p_b64u: process.env.SHAMIR_P_B64U,
    shamir_e_s_b64u: process.env.SHAMIR_E_S_B64U,
    shamir_d_s_b64u: process.env.SHAMIR_D_S_B64U,
});
const app = express();
// Middleware
app.use(express.json());
const allowedOrigins = [config.expectedOrigin, config.expectedWalletOrigin].filter(Boolean);
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Internal AuthService error');
});
// Account creation route
app.post('/create_account_and_register_user', async (req, res) => {
    try {
        const { new_account_id, new_public_key, vrf_data, webauthn_registration, deterministic_vrf_public_key, authenticator_options } = req.body;
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
        }
        else {
            // Return error response with appropriate HTTP status code
            console.error('account creation and registration failed:', result.error);
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('account creation and registration failed:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown server error'
        });
    }
});
// Removed legacy SRA routes
// Shamir 3-pass endpoints
app.post('/vrf/apply-server-lock', async (req, res) => {
    try {
        console.log("apply-server-lock request.body", req.body);
        const serverResponse = await authService.handleApplyServerLock({
            body: req.body
        });
        Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v));
        res.status(serverResponse.status);
        res.send(JSON.parse(serverResponse.body));
    }
    catch (e) {
        res.status(500).json({
            error: 'internal',
            details: e?.message
        });
    }
});
app.post('/vrf/remove-server-lock', async (req, res) => {
    try {
        console.log("remove-server-lock request.body", req.body);
        const serverResponse = await authService.handleRemoveServerLock({
            body: req.body
        });
        Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v));
        res.status(serverResponse.status);
        res.send(JSON.parse(serverResponse.body));
    }
    catch (e) {
        res.status(500).json({
            error: 'internal',
            details: e?.message
        });
    }
});
app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
    console.log(`Expected Frontend Origin: ${config.expectedOrigin}`);
    authService.getRelayerAccount().then((relayer) => {
        console.log(`AuthService connected with relayer account: ${relayer.accountId}`);
    }).catch((err) => {
        console.error("AuthService initial check failed (non-blocking server start):", err);
    });
});
//# sourceMappingURL=index.js.map