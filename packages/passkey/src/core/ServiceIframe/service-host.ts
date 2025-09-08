// Minimal service iframe host bootstrap. Intended to run in the wallet origin page.
// It adopts a MessagePort from the parent and replies READY. RPC handlers are stubs for now.

import type {
  ChildToParentEnvelope,
  ParentToChildEnvelope,
  ReadyPayload,
} from './messages';
import { PasskeyClientDBManager } from '../IndexedDBManager/passkeyClientDB';
import { WebAuthnManager } from '../WebAuthnManager';
import { MinimalNearClient } from '../NearClient';
import type { PasskeyManagerConfigs } from '../types/passkeyManager';
import { toActionArgsWasm } from '../types/actions';

const PROTOCOL: ReadyPayload['protocolVersion'] = '1.0.0';

let port: MessagePort | null = null;
const clientDB = new PasskeyClientDBManager();
let walletConfigs: PasskeyManagerConfigs | null = null;
let nearClient: MinimalNearClient | null = null;
let webAuthnManager: WebAuthnManager | null = null;

function ensureManagers(): void {
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call SET_CONFIG with nearRpcUrl/contractId first.');
  }
  if (!nearClient) {
    nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  }
  if (!webAuthnManager) {
    webAuthnManager = new WebAuthnManager(walletConfigs, nearClient);
  }
}

function post(msg: ChildToParentEnvelope) {
  try { port?.postMessage(msg); } catch {}
}

function onPortMessage(e: MessageEvent) {
  const req = e.data as ParentToChildEnvelope;
  if (!req || typeof req !== 'object') return;
  const requestId = (req as any).requestId as string | undefined;

  // Basic ping
  if (req.type === 'PING') {
    post({ type: 'PONG', requestId });
    return;
  }

  if (req.type === 'SET_CONFIG') {
    // Merge partial config
    walletConfigs = {
      nearRpcUrl: (req.payload as any)?.nearRpcUrl || walletConfigs?.nearRpcUrl || '',
      nearNetwork: (req.payload as any)?.nearNetwork || walletConfigs?.nearNetwork || 'testnet',
      contractId: (req.payload as any)?.contractId || walletConfigs?.contractId || '',
      nearExplorerUrl: walletConfigs?.nearExplorerUrl,
      relayer: (req.payload as any)?.relayer || walletConfigs?.relayer || { initialUseRelayer: true, accountId: '', url: '' },
      authenticatorOptions: (walletConfigs as any)?.authenticatorOptions,
      vrfWorkerConfigs: (req.payload as any)?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
      walletOrigin: undefined,
      walletServicePath: undefined,
      walletTheme: (req.payload as any)?.theme || (walletConfigs as any)?.walletTheme,
    } as PasskeyManagerConfigs as any;
    // Recreate managers on config change
    nearClient = null; webAuthnManager = null;
    post({ type: 'PONG', requestId });
    return;
  }

  // DB handlers (initial set)
  (async () => {
    try {
      switch (req.type) {
        // ====== Handler-aligned requests (stubs) ======
        case 'REQUEST_signTransactionsWithActions':
        case 'REQUEST_SIGN': {
          ensureManagers();
          const p = (req.payload || {}) as any;
          const nearAccountId = p.nearAccountId as string;
          const txs = Array.isArray(p.txSigningRequests) ? p.txSigningRequests : [];
          // Normalize actions to wasm shape
          const wasmTxs = txs.map((t: any) => ({
            receiverId: t.receiverId,
            actions: (t.actions || []).map((a: any) => toActionArgsWasm(a))
          }));

          const rpcCall = {
            contractId: walletConfigs!.contractId,
            nearRpcUrl: walletConfigs!.nearRpcUrl,
            nearAccountId,
          } as any;

          const confirmationConfig = p.confirmationConfig as any;

          const results = await webAuthnManager!.signTransactionsWithActions({
            transactions: wasmTxs,
            rpcCall,
            confirmationConfigOverride: confirmationConfig,
            onEvent: (ev) => {
              post({ type: 'PROGRESS', payload: {
                step: ev.step,
                phase: ev.phase,
                status: ev.status,
                message: ev.message,
                data: ev.data,
              }});
            }
          });

          post({ type: 'SIGN_RESULT', requestId, payload: { success: true, signedTransactions: results } });
          return;
        }
        case 'REQUEST_signVerifyAndRegisterUser': {
          post({ type: 'ERROR', requestId, payload: { code: 'NOT_IMPLEMENTED', message: 'Registration handler not yet wired' } });
          return;
        }
        case 'REQUEST_decryptPrivateKeyWithPrf':
        case 'REQUEST_deriveNearKeypairAndEncrypt':
        case 'REQUEST_recoverKeypairFromPasskey':
        case 'REQUEST_signTransactionWithKeyPair':
        case 'REQUEST_signNep413Message': {
          post({ type: 'ERROR', requestId, payload: { code: 'NOT_IMPLEMENTED', message: `Handler not yet wired (${req.type})` } });
          return;
        }
        case 'DB_GET_USER': {
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await clientDB.getUser(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_GET_LAST_USER': {
          const result = await clientDB.getLastUser();
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_SET_LAST_USER': {
          const { nearAccountId, deviceNumber } = (req.payload || {}) as any;
          await clientDB.setLastUser(nearAccountId, deviceNumber ?? 1);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true } });
          return;
        }
        case 'DB_GET_PREFERENCES': {
          const { nearAccountId } = (req.payload || {}) as any;
          const user = await clientDB.getUser(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result: user?.preferences || null } });
          return;
        }
        case 'DB_UPDATE_PREFERENCES': {
          const { nearAccountId, patch } = (req.payload || {}) as any;
          await clientDB.updatePreferences(nearAccountId, patch || {});
          const user = await clientDB.getUser(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result: user?.preferences || null } });
          return;
        }
        case 'DB_GET_CONFIRMATION_CONFIG': {
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await clientDB.getConfirmationConfig(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_GET_THEME': {
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await clientDB.getTheme(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_SET_THEME': {
          const { nearAccountId, theme } = (req.payload || {}) as any;
          await clientDB.setTheme(nearAccountId, theme);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result: theme } });
          return;
        }
        case 'DB_TOGGLE_THEME': {
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await clientDB.toggleTheme(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_GET_AUTHENTICATORS': {
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await clientDB.getAuthenticatorsByUser(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_STORE_AUTHENTICATOR': {
          const { record } = (req.payload || {}) as any;
          await clientDB.storeAuthenticator(record);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true } });
          return;
        }

        // ====== Additional wallet operations that do not require a new WebAuthn ceremony from parent ======
        case 'REQUEST_decryptPrivateKeyWithPrf': {
          ensureManagers();
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await webAuthnManager!.exportNearKeypairWithTouchId(nearAccountId);
          // Map to decryptPrivateKeyWithPrf-like shape
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result: { decryptedPrivateKey: result.privateKey, nearAccountId: result.accountId } } });
          return;
        }
        case 'REQUEST_signTransactionWithKeyPair': {
          ensureManagers();
          const { nearPrivateKey, signerAccountId, receiverId, nonce, blockHash, actions } = (req.payload || {}) as any;
          const wasmActions = (actions || []).map((a: any) => toActionArgsWasm(a));
          const result = await webAuthnManager!.signTransactionWithKeyPair({
            nearPrivateKey,
            signerAccountId,
            receiverId,
            nonce,
            blockHash,
            actions: wasmActions,
          });
          post({ type: 'SIGN_RESULT', requestId, payload: { success: true, signedTransactions: [result] } });
          return;
        }
        case 'REQUEST_signNep413Message': {
          ensureManagers();
          const { nearAccountId, message, recipient, state } = (req.payload || {}) as any;
          // get nonce + block data
          const { nextNonce, txBlockHash, txBlockHeight } = await webAuthnManager!.getNonceManager().getNonceBlockHashAndHeight(nearClient!);
          const vrfChallenge = await webAuthnManager!.generateVrfChallenge({
            userId: nearAccountId,
            rpId: window.location.hostname,
            blockHash: txBlockHash,
            blockHeight: txBlockHeight,
          } as any);
          const authenticators = await webAuthnManager!.getAuthenticatorsByUser(nearAccountId);
          const credential = await webAuthnManager!.getCredentials({
            nearAccountId,
            challenge: vrfChallenge as any,
            authenticators,
          } as any);

          const result = await webAuthnManager!.signNEP413Message({
            message,
            recipient,
            nonce: nextNonce,
            state: (state ?? null) as any,
            accountId: nearAccountId,
            credential,
          } as any);
          post({ type: 'NEP413_RESULT', requestId, payload: result });
          return;
        }
        case 'REQUEST_deriveNearKeypairAndEncrypt': {
          ensureManagers();
          const { nearAccountId, credential, options } = (req.payload || {}) as any;
          const result = await webAuthnManager!.deriveNearKeypairAndEncrypt({
            nearAccountId,
            credential: credential as any,
            options: options as any,
          });
          // Return as DB_RESULT for now (contains success, publicKey, signedTransaction?)
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'REQUEST_recoverKeypairFromPasskey': {
          ensureManagers();
          const { authenticationCredential, accountIdHint } = (req.payload || {}) as any;
          const result = await webAuthnManager!.recoverKeypairFromPasskey(authenticationCredential as any, accountIdHint);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'REQUEST_signVerifyAndRegisterUser': {
          ensureManagers();
          const { contractId, credential, vrfChallenge, deterministicVrfPublicKey, nearAccountId, nearPublicKeyStr, deviceNumber, authenticatorOptions } = (req.payload || {}) as any;
          const regResult = await webAuthnManager!.signVerifyAndRegisterUser({
            contractId: contractId || walletConfigs!.contractId,
            credential: credential as any,
            vrfChallenge: vrfChallenge as any,
            deterministicVrfPublicKey,
            nearAccountId,
            nearPublicKeyStr,
            nearClient: nearClient!,
            deviceNumber: deviceNumber ?? 1,
            authenticatorOptions: authenticatorOptions as any,
          } as any);
          post({ type: 'REGISTER_RESULT', requestId, payload: regResult });
          return;
        }
      }

      // Default stub response until remaining handlers are implemented
      post({
        type: 'ERROR',
        requestId,
        payload: {
          code: 'NOT_IMPLEMENTED',
          message: `Handler not implemented for ${req.type}`,
        }
      });
    } catch (err: any) {
      post({
        type: 'ERROR',
        requestId,
        payload: {
          code: 'DB_ERROR',
          message: err?.message || String(err),
        }
      });
    }
  })();
}

function adoptPort(p: MessagePort) {
  port = p;
  port.onmessage = onPortMessage as any;
  port.start?.();
  post({ type: 'READY', payload: { protocolVersion: PROTOCOL } });
}

function onWindowMessage(e: MessageEvent) {
  const { data, ports } = e;
  if (!data || typeof data !== 'object') return;
  if ((data as any).type === 'CONNECT' && ports && ports[0]) {
    adoptPort(ports[0]);
  }
}

// Auto‑bootstrap when imported
try {
  window.addEventListener('message', onWindowMessage);
} catch {}

export {}; // module
