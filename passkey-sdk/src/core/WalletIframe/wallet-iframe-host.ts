// Minimal service iframe host bootstrap. Intended to run in the wallet origin page.
// It adopts a MessagePort from the parent and replies READY. RPC handlers are stubs for now.
try { window.addEventListener('DOMContentLoaded', () => console.debug('[WalletHost] DOMContentLoaded')); } catch {}
try { window.addEventListener('load', () => console.debug('[WalletHost] window load')); } catch {}
try { window.parent?.postMessage({ type: 'SERVICE_HOST_BOOTED' }, '*'); } catch {}
try { window.addEventListener('error', (e) => console.debug('[WalletHost] window error', e.error || e.message)); } catch {}
try { window.addEventListener('unhandledrejection', (e) => console.debug('[WalletHost] unhandledrejection', e.reason)); } catch {}
try {
  window.addEventListener('click', (e) => {
    try {
      const t = e.target as HTMLElement;
      const name = t?.tagName?.toLowerCase() || 'unknown';
      const cls = t?.className || '';
      window.parent?.postMessage({ type: 'SERVICE_HOST_CLICK', name, cls }, '*');
    } catch {}
  }, true);
} catch {}

import type {
  ChildToParentEnvelope,
  ParentToChildEnvelope,
  ReadyPayload,
} from './messages';
import { PasskeyClientDBManager } from '../IndexedDBManager/passkeyClientDB';
import { PasskeyNearKeysDBManager } from '../IndexedDBManager/passkeyNearKeysDB';
import { WebAuthnManager } from '../WebAuthnManager';
import { MinimalNearClient, type SignedTransaction } from '../NearClient';
import type { PasskeyManagerConfigs } from '../types/passkeyManager';
import type { VerifyAndSignTransactionResult, RegistrationResult } from '../types/passkeyManager';
import { toActionArgsWasm } from '../types/actions';
import { createRandomVRFChallenge, type VRFChallenge } from '../types/vrf-worker';
import { generateBootstrapVrfChallenge } from '../WebAuthnManager/registration';
import { createAccountAndRegisterWithRelayServer } from '../PasskeyManager/faucets/createAccountRelayServer';

// NOTE: Concrete fix for invisible <w3a-registration-modal>:
// Import the actual element classes (not just side‑effect modules) so bundlers
// can't tree‑shake them away. We then explicitly define them below if missing.
// Without this, the custom element never upgrades (no shadowRoot), so the modal
// tag appears empty and nothing is rendered.
import RegistrationModalElementDefined from '../WebAuthnManager/LitComponents/RegistrationModal';
import RegistrationDrawerElementDefined from '../WebAuthnManager/LitComponents/RegistrationDrawer';

const PROTOCOL: ReadyPayload['protocolVersion'] = '1.0.0';

let port: MessagePort | null = null;
const clientDB = new PasskeyClientDBManager();
const nearKeysDB = new PasskeyNearKeysDBManager();
let walletConfigs: PasskeyManagerConfigs | null = null;
let nearClient: MinimalNearClient | null = null;
let webAuthnManager: WebAuthnManager | null = null;

// Ensure custom elements are actually defined at runtime (avoids tree‑shake loss)
try {
  const haveModal = !!customElements.get('w3a-registration-modal');
  const haveDrawer = !!customElements.get('w3a-registration-drawer');
  // If the elements aren't registered yet, define them explicitly using the
  // imported classes above. This is the key change that made the modal render.
  if (!haveModal && RegistrationModalElementDefined) {
    customElements.define('w3a-registration-modal', RegistrationModalElementDefined as any);
  }
  if (!haveDrawer && RegistrationDrawerElementDefined) {
    customElements.define('w3a-registration-drawer', RegistrationDrawerElementDefined as any);
  }
  // Expose for debugging to keep imports alive in aggressive tree-shaking
  (window as any).__w3a_ce_debug = {
    regModalDefined: !!customElements.get('w3a-registration-modal'),
    regDrawerDefined: !!customElements.get('w3a-registration-drawer'),
  };
} catch {}

// Minimal user-activation overlay to satisfy WebAuthn requirements in cross-origin iframes
function withUserActivation(run: () => Promise<void>): void {
  try {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const panel = document.createElement('div');
    panel.style.background = 'white';
    panel.style.color = '#111';
    panel.style.padding = '20px 24px';
    panel.style.borderRadius = '12px';
    panel.style.width = 'min(420px, 90vw)';
    panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';

    const h = document.createElement('div');
    h.textContent = 'Continue in wallet';
    h.style.fontSize = '18px';
    h.style.fontWeight = '600';
    h.style.marginBottom = '10px';

    const p = document.createElement('div');
    p.textContent = 'Click Continue to create your passkey.';
    p.style.fontSize = '14px';
    p.style.opacity = '0.85';
    p.style.marginBottom = '16px';

    const btn = document.createElement('button');
    btn.textContent = 'Continue';
    btn.style.padding = '10px 14px';
    btn.style.fontSize = '15px';
    btn.style.fontWeight = '600';
    btn.style.background = '#111';
    btn.style.color = 'white';
    btn.style.border = '0';
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', async () => {
      try {
        overlay.remove();
      } catch {}
      try {
        await run();
      } catch {
        // Errors are handled by caller via post()
      }
    }, { once: true });

    panel.appendChild(h); panel.appendChild(p); panel.appendChild(btn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    try { btn.focus(); } catch {}
  } catch (e) {
    // If UI injection fails, fallback to direct call (may still fail due to activation)
    run().catch(() => {});
  }
}

// Present the RegistrationModal and resolve when user confirms (or reject on cancel)
function presentRegistrationModal({ accountId, theme }: { accountId: string; theme?: 'dark' | 'light' }): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tag = 'w3a-registration-modal';
      const modal = document.createElement(tag) as any;
      modal.setAttribute('open', '');
      if (theme) modal.setAttribute('theme', theme);
      modal.title = 'Create your passkey';
      modal.subtitle = 'TouchID/biometric may be required';
      modal.accountId = accountId;

      const cleanup = () => { try { modal.remove(); } catch {} };
      const onConfirm = () => { cleanup(); resolve(); };
      const onCancel = () => { cleanup(); reject(new Error('Registration cancelled')); };
      modal.addEventListener('confirm', onConfirm, { once: true });
      modal.addEventListener('cancel', onCancel, { once: true });
      document.body.appendChild(modal);
    } catch (e) {
      reject(e);
    }
  });
}

function presentRegistrationDrawer({ accountId, theme }: { accountId: string; theme?: 'dark' | 'light' }): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tag = 'w3a-registration-drawer';
      const drawer = document.createElement(tag) as any;
      drawer.setAttribute('open', '');
      if (theme) drawer.setAttribute('theme', theme);
      drawer.title = 'Create your passkey';
      drawer.subtitle = 'TouchID/biometric may be required';
      drawer.accountId = accountId;

      const cleanup = () => { try { drawer.remove(); } catch {} };
      const onConfirm = () => { cleanup(); resolve(); };
      const onCancel = () => { cleanup(); reject(new Error('Registration cancelled')); };
      drawer.addEventListener('confirm', onConfirm, { once: true });
      drawer.addEventListener('cancel', onCancel, { once: true });
      document.body.appendChild(drawer);
      // Defer open attribute to trigger transition after insertion
      requestAnimationFrame(() => { drawer.setAttribute('open', ''); });
    } catch (e) {
      reject(e);
    }
  });
}

function ensureManagers(): void {
  if (!walletConfigs || !walletConfigs.nearRpcUrl) {
    throw new Error('Wallet service not configured. Call SET_CONFIG with nearRpcUrl/contractId first.');
  }
  if (!nearClient) {
    nearClient = new MinimalNearClient(walletConfigs.nearRpcUrl);
  }
  if (!webAuthnManager) {
    // Important: For wallet-origin ceremonies we must use the wallet host as RP ID.
    // If an rpIdOverride was provided (to support parent-app flows), ignore it here
    // so navigator.credentials.create/get uses window.location.hostname within the wallet.
    const walletScopedConfigs = { ...walletConfigs, rpIdOverride: undefined } as any;
    webAuthnManager = new WebAuthnManager(walletScopedConfigs, nearClient);
  }
}

function post(msg: ChildToParentEnvelope) {
  try { port?.postMessage(msg); } catch {}
}

// Plain fallback overlay in case Lit modal fails to render/upgrade
function showPlainRegistrationOverlay({ accountId, onConfirm, onCancel }: {
  accountId: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.45)';
  overlay.style.zIndex = '2147483647';
  overlay.style.display = 'grid';
  overlay.style.placeItems = 'center';

  const card = document.createElement('div');
  card.style.background = '#111';
  card.style.color = '#f6f7f8';
  card.style.border = '1px solid rgba(255,255,255,0.08)';
  card.style.borderRadius = '12px';
  card.style.padding = '18px 20px';
  card.style.width = 'min(520px, 92vw)';
  card.style.boxShadow = '0 12px 32px rgba(0,0,0,0.35)';

  const title = document.createElement('div');
  title.textContent = 'Create your passkey';
  title.style.fontWeight = '700';
  title.style.fontSize = '18px';
  title.style.marginBottom = '8px';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'TouchID/biometric may be required';
  subtitle.style.opacity = '0.85';
  subtitle.style.fontSize = '14px';
  subtitle.style.marginBottom = '10px';

  const acct = document.createElement('div');
  acct.textContent = accountId;
  acct.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  acct.style.fontSize = '13px';
  acct.style.opacity = '0.92';
  acct.style.marginBottom = '12px';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  actions.style.justifyContent = 'flex-end';

  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.background = '#2b2b2b';
  cancel.style.color = '#ddd';
  cancel.style.border = '0';
  cancel.style.borderRadius = '8px';
  cancel.style.padding = '9px 13px';
  cancel.style.cursor = 'pointer';
  cancel.addEventListener('click', () => { try { overlay.remove(); } catch {}; onCancel(); }, { once: true });

  const confirm = document.createElement('button');
  confirm.textContent = 'Continue';
  confirm.style.background = '#4DAFFE';
  confirm.style.color = '#0b1220';
  confirm.style.border = '0';
  confirm.style.borderRadius = '8px';
  confirm.style.padding = '9px 13px';
  confirm.style.cursor = 'pointer';
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    try { await onConfirm(); } finally { try { overlay.remove(); } catch {} }
  }, { once: true });

  actions.appendChild(cancel);
  actions.appendChild(confirm);
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(acct);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  try { (confirm as HTMLButtonElement).focus(); } catch {}
  return overlay;
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
      relayer: (req.payload as any)?.relayer || walletConfigs?.relayer || { accountId: '', url: '' },
      authenticatorOptions: (walletConfigs as any)?.authenticatorOptions,
      vrfWorkerConfigs: (req.payload as any)?.vrfWorkerConfigs || walletConfigs?.vrfWorkerConfigs,
      walletOrigin: undefined,
      walletServicePath: undefined,
      walletTheme: (req.payload as any)?.theme || (walletConfigs as any)?.walletTheme,
      rpIdOverride: (req.payload as any)?.rpIdOverride || (walletConfigs as any)?.rpIdOverride,
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
        case 'REQUEST_checkVrfStatus': {
          ensureManagers();
          const status = await webAuthnManager!.checkVrfStatus();
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result: status } });
          return;
        }
        case 'REQUEST_clearVrfSession': {
          ensureManagers();
          await webAuthnManager!.clearVrfSession();
          post({ type: 'DB_RESULT', requestId, payload: { ok: true } });
          return;
        }
        case 'REQUEST_loginPasskey': {
          ensureManagers();
          const { nearAccountId } = (req.payload || {}) as any;
          if (!nearAccountId) {
            post({ type: 'ERROR', requestId, payload: { code: 'INVALID_ARGUMENT', message: 'nearAccountId is required' } });
            return;
          }
          try {
            const userData = await webAuthnManager!.getUser(nearAccountId);
            if (!userData) throw new Error(`No user data found for ${nearAccountId}`);
            if (!userData?.encryptedVrfKeypair?.encryptedVrfDataB64u || !userData?.encryptedVrfKeypair?.chacha20NonceB64u) {
              throw new Error('No VRF credentials found. Please register first.');
            }

            // Attempt server-assisted (Shamir 3-pass) unlock first if available
            let unlocked = false;
            try {
              const shamir = (userData as any).serverEncryptedVrfKeypair;
              // If server-encrypted fields exist, try Shamir3Pass regardless of separate relayer config.
              // The VRF worker itself is configured with relay server URLs via vrfWorkerConfigs.
              if (shamir?.ciphertextVrfB64u && shamir?.kek_s_b64u) {
                const r = await webAuthnManager!.shamir3PassDecryptVrfKeypair({
                  nearAccountId,
                  kek_s_b64u: shamir.kek_s_b64u,
                  ciphertextVrfB64u: shamir.ciphertextVrfB64u,
                } as any);
                if (r?.success) {
                  const status = await webAuthnManager!.checkVrfStatus();
                  unlocked = !!(status.active && status.nearAccountId === nearAccountId);
                }
              }
            } catch (e) {
              try { console.warn('[WalletHost] Shamir3Pass unlock failed, falling back to TouchID'); } catch {}
            }

            if (!unlocked) {
              // Fallback to TouchID authentication using a random VRF challenge (no VRF keypair required yet)
              const authenticators = await webAuthnManager!.getAuthenticatorsByUser(nearAccountId);
              if (!authenticators?.length) throw new Error(`No authenticators found for ${nearAccountId}`);
              const randomChallenge = createRandomVRFChallenge();
              const credential = await webAuthnManager!.getCredentials({
                nearAccountId,
                challenge: randomChallenge as any,
                authenticators,
              } as any);
              const unlockRes = await webAuthnManager!.unlockVRFKeypair({
                nearAccountId,
                encryptedVrfKeypair: {
                  encryptedVrfDataB64u: userData.encryptedVrfKeypair.encryptedVrfDataB64u,
                  chacha20NonceB64u: userData.encryptedVrfKeypair.chacha20NonceB64u,
                },
                credential,
              } as any);
              if (!unlockRes?.success) {
                throw new Error(unlockRes?.error || 'VRF unlock failed');
              }
            }

            // Update last login + set current user context
            try { await webAuthnManager!.updateLastLogin(nearAccountId); } catch {}
            try { await webAuthnManager!.setLastUser(nearAccountId); } catch {}
            try { await webAuthnManager!.setCurrentUser(nearAccountId); } catch {}

            post({ type: 'DB_RESULT', requestId, payload: { ok: true, result: { success: true, nearAccountId } } });
          } catch (err: any) {
            post({ type: 'ERROR', requestId, payload: { code: 'DB_ERROR', message: err?.message || String(err) } });
          }
          return;
        }
        // ====== Handler-aligned requests ======
        case 'REQUEST_signTransactionsWithActions': {
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

          const results: VerifyAndSignTransactionResult[] = await webAuthnManager!.signTransactionsWithActions({
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
        // Handlers implemented below (leave out of NOT_IMPLEMENTED stub list)
        case 'REQUEST_registerPasskey': {
          ensureManagers();
          const { nearAccountId, authenticatorOptions, uiMode } = (req.payload || {}) as any;
          try {
            // Prefetch VRF challenge so credentials.create can run immediately on user click
            post({ type: 'PROGRESS', payload: { step: 0, phase: 'registration', status: 'progress', message: 'Prefetching VRF challenge...' } });
            const preCtx: any = { webAuthnManager: webAuthnManager!, nearClient: nearClient!, configs: walletConfigs! };
            const vrfChallenge: VRFChallenge = await generateBootstrapVrfChallenge(preCtx, nearAccountId);

            // Inline modal/drawer injection so we can run credentials.create inside a user gesture
            try {
              const ceDiag = {
                modalDefined: !!customElements.get('w3a-registration-modal'),
                drawerDefined: !!customElements.get('w3a-registration-drawer'),
              };
              post({ type: 'PROGRESS', payload: { step: 1, phase: 'registration', status: 'progress', message: `Custom elements: ${JSON.stringify(ceDiag)}` } });
            } catch {}
            const tag = uiMode === 'drawer' ? 'w3a-registration-drawer' : 'w3a-registration-modal';
            const modal = document.createElement(tag) as any;
            const theme = (walletConfigs as any)?.walletTheme;
            if (theme) modal.setAttribute('theme', theme);
            modal.title = 'Create your passkey';
            modal.subtitle = 'TouchID/biometric may be required';
            modal.accountId = nearAccountId;
            // Notify parent that modal is presented
            post({ type: 'PROGRESS', payload: { step: 1, phase: 'registration', status: 'progress', message: 'Modal presented' } });

            const cleanup = () => { try { modal.remove(); } catch {} };

            const onCancel = () => {
              cleanup();
              post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Registration cancelled' } });
            };
            const onConfirm = async () => {
              try {
                modal.loading = true;
                post({ type: 'PROGRESS', payload: { step: 2, phase: 'registration', status: 'progress', message: 'Confirm clicked' } });
                // Step A: Run WebAuthn ceremony immediately under user gesture using pre-fetched VRF challenge
                const credential = await webAuthnManager!.generateRegistrationCredentials({
                  nearAccountId,
                  challenge: vrfChallenge,
                } as any);

                // Step B: Derive VRF and NEAR keys + contract pre-checks in parallel
                const [deterministicVrfKeyResult, nearKeyResult, canRegisterUserResult] = await Promise.all([
                  webAuthnManager!.deriveVrfKeypair({ credential, nearAccountId, saveInMemory: true } as any),
                  webAuthnManager!.deriveNearKeypairAndEncrypt({ credential, nearAccountId } as any),
                  webAuthnManager!.checkCanRegisterUser({
                    contractId: (walletConfigs as any)!.contractId,
                    credential,
                    vrfChallenge,
                    onEvent: (progress: any) => post({ type: 'PROGRESS', payload: { step: 4, phase: 'registration', status: 'progress', message: `Checking registration: ${progress.message || ''}` } })
                  } as any),
                ]);

                if (!deterministicVrfKeyResult.success || !deterministicVrfKeyResult.vrfPublicKey) {
                  throw new Error('Failed to derive deterministic VRF keypair from PRF');
                }
                if (!nearKeyResult.success || !nearKeyResult.publicKey) {
                  throw new Error('Failed to generate NEAR keypair with PRF');
                }
                if (!canRegisterUserResult.verified) {
                  const errorMessage = canRegisterUserResult.error || 'User verification failed - account may already exist or contract is unreachable';
                  throw new Error(`Web3Authn contract registration check failed: ${errorMessage}`);
                }

                // Step C: Atomic account creation + registration via relay
                const accountAndRegistrationResult = await createAccountAndRegisterWithRelayServer(
                  preCtx,
                  nearAccountId,
                  nearKeyResult.publicKey,
                  credential,
                  vrfChallenge,
                  deterministicVrfKeyResult.vrfPublicKey,
                  authenticatorOptions as any,
                  (ev) => post({ type: 'PROGRESS', payload: { step: ev.step || 6, phase: ev.phase || 'registration', status: ev.status || 'progress', message: ev.message } })
                );

                if (!accountAndRegistrationResult.success) {
                  throw new Error(accountAndRegistrationResult.error || 'Account creation and registration failed');
                }

                // Step D: Store registration data atomically
                await webAuthnManager!.atomicStoreRegistrationData({
                  nearAccountId,
                  credential,
                  publicKey: nearKeyResult.publicKey,
                  encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
                  vrfPublicKey: deterministicVrfKeyResult.vrfPublicKey,
                  serverEncryptedVrfKeypair: deterministicVrfKeyResult.serverEncryptedVrfKeypair,
                  onEvent: (ev: any) => post({ type: 'PROGRESS', payload: { step: 5, phase: 'registration', status: 'progress', message: ev.message || 'Storing VRF registration data' } })
                } as any);

                // Step E: Unlock VRF keypair in memory for login
                const unlockResult = await webAuthnManager!.unlockVRFKeypair({
                  nearAccountId,
                  encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
                  credential,
                } as any).catch((unlockError: any) => ({ success: false, error: unlockError.message }));
                if (!unlockResult.success) {
                  throw new Error(unlockResult.error || 'VRF keypair unlock failed');
                }

                // Update last login + set current user context
                try { await webAuthnManager!.updateLastLogin(nearAccountId); } catch {}
                try { await webAuthnManager!.setLastUser(nearAccountId); } catch {}
                try { await webAuthnManager!.setCurrentUser(nearAccountId); } catch {}

                cleanup();
                post({ type: 'REGISTER_RESULT', requestId, payload: {
                  success: true,
                  nearAccountId,
                  clientNearPublicKey: nearKeyResult.publicKey,
                  transactionId: accountAndRegistrationResult.transactionId || null,
                  vrfRegistration: {
                    success: true,
                    vrfPublicKey: vrfChallenge.vrfPublicKey,
                    encryptedVrfKeypair: deterministicVrfKeyResult.encryptedVrfKeypair,
                    contractVerified: accountAndRegistrationResult.success,
                  }
                }});
              } catch (err: any) {
                // Show error inline and also notify parent
                try { modal.loading = false; modal.errorMessage = err?.message || 'Registration failed'; } catch {}
                cleanup();
                post({ type: 'ERROR', requestId, payload: { code: 'DB_ERROR', message: err?.message || 'Registration failed' } });
              }
            };
            modal.addEventListener('cancel', onCancel, { once: true });
            modal.addEventListener('confirm', onConfirm, { once: true });
            // Instrument clicks for debugging user activation issues
            try {
              modal.addEventListener('click', (e: any) => {
                try { post({ type: 'PROGRESS', payload: { step: 1, phase: 'registration', status: 'progress', message: `Modal click: ${String((e.target && e.target.className) || e.type)}` } }); } catch {}
              }, true);
            } catch {}
            document.body.appendChild(modal);
            // Set open after insertion to ensure styles apply consistently
            requestAnimationFrame(() => {
              try { modal.setAttribute('open', ''); } catch {}
              try {
                // Inspect shadow content for visibility diagnostics
                const sr = (modal as any).shadowRoot;
                const overlay = sr?.querySelector?.('.overlay');
                const card = sr?.querySelector?.('.card');
                const dbg = {
                  hasShadow: !!sr,
                  overlayDisplay: overlay ? window.getComputedStyle(overlay).display : 'n/a',
                  cardRect: card ? (card as HTMLElement).getBoundingClientRect().toJSON?.() || card.getBoundingClientRect() : 'n/a',
                  hostRect: (modal as HTMLElement).getBoundingClientRect().toJSON?.() || (modal as HTMLElement).getBoundingClientRect(),
                  openAttr: (modal as HTMLElement).getAttribute('open'),
                } as any;
                post({ type: 'PROGRESS', payload: { step: 1, phase: 'registration', status: 'progress', message: `Modal diagnostics: ${JSON.stringify(dbg)}` } });
                // If the Lit modal didn't become visible, fall back to a plain overlay
                const visible = !!(overlay && window.getComputedStyle(overlay).display !== 'none');
                const sizeOk = !!(card && (card as HTMLElement).getBoundingClientRect().width > 2);
                if (!visible || !sizeOk) {
                  post({ type: 'PROGRESS', payload: { step: 1, phase: 'registration', status: 'progress', message: 'Lit modal not visible; showing plain fallback overlay' } });
                  showPlainRegistrationOverlay({ accountId: nearAccountId, onConfirm, onCancel });
                }
              } catch {
                // On any diagnostics error, show fallback immediately
                showPlainRegistrationOverlay({ accountId: nearAccountId, onConfirm, onCancel });
              }
            });
            // Safety timeout in case no user action occurs
            try {
              setTimeout(() => {
                if (!modal.isConnected) return; // already handled
                try { modal.errorMessage = 'Timed out waiting for confirmation'; } catch {}
                try { modal.remove(); } catch {}
                post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: 'Registration timed out' } });
              }, 90000);
            } catch {}
          } catch (err: any) {
            post({ type: 'ERROR', requestId, payload: { code: 'CANCELLED', message: err?.message || 'Registration cancelled' } });
          }
          return;
        }
        case 'DB_GET_USER': {
          const { nearAccountId } = (req.payload || {}) as any;
          const result = await clientDB.getUser(nearAccountId);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_GET_ALL_USERS': {
          const result = await clientDB.getAllUsers();
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_STORE_WEBAUTHN_USER': {
          const { userData } = (req.payload || {}) as any;
          if (!userData || typeof userData !== 'object') {
            throw new Error('Invalid userData payload');
          }
          await clientDB.storeWebAuthnUserData(userData);
          post({ type: 'DB_RESULT', requestId, payload: { ok: true } });
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

        // ====== PasskeyNearKeys DB operations ======
        case 'DB_NEAR_KEYS_GET_ALL': {
          const result = await nearKeysDB.getAllEncryptedKeys();
          post({ type: 'DB_RESULT', requestId, payload: { ok: true, result } });
          return;
        }
        case 'DB_NEAR_KEYS_STORE': {
          const { record } = (req.payload || {}) as any;
          if (!record || typeof record !== 'object') throw new Error('Invalid near key record');
          await nearKeysDB.storeEncryptedKey(record);
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
          const result: { signedTransaction: SignedTransaction; logs?: string[] } = await webAuthnManager!.signTransactionWithKeyPair({
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
  try { console.debug('[WalletHost] Port adopted; posting READY'); } catch {}
  post({ type: 'READY', payload: { protocolVersion: PROTOCOL } });
}

function onWindowMessage(e: MessageEvent) {
  const { data, ports } = e;
  if (!data || typeof data !== 'object') return;
  if ((data as any).type === 'CONNECT' && ports && ports[0]) {
    try { console.debug('[WalletHost] CONNECT received; adopting port'); } catch {}
    adoptPort(ports[0]);
  }
}

// Auto‑bootstrap when imported
try {
  window.addEventListener('message', onWindowMessage);
} catch {}

export {}; // module
