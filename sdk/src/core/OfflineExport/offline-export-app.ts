/**
 * Offline Export App (minimal, zero-config)
 *
 * Runs under `/offline-export/` on the wallet origin and reuses the
 * WebAuthnManager.exportNearKeypairWithUI() VRF-driven flow to decrypt and
 * display the private key export viewer. No network requests are made.
 *
 * See `docs/vrf2-refactor-export-keys.md` for the canonical export flow design.
 */
import { IndexedDBManager } from '../IndexedDBManager';
import { MinimalNearClient } from '../NearClient';
import { toAccountId } from '../types/accountIds';
import { OFFLINE_EXPORT_DONE, OFFLINE_EXPORT_ERROR } from './messages';
import type { TatchiConfigsInput } from '../types/tatchi';
import { WebAuthnManager } from '../WebAuthnManager';
import { TouchIdPrompt } from '../WebAuthnManager/touchIdPrompt';
import { createRandomVRFChallenge, type VRFChallenge } from '../types/vrf-worker';
import { buildConfigsFromEnv } from '../defaultConfigs';

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  // Register and await ready() only in this route; SW is in-scope here
  await navigator.serviceWorker
    .register('/offline-export/sw.js', { scope: '/offline-export/' })
    .catch(() => {});
  await navigator.serviceWorker.ready.catch(() => {});
}

async function prewarmSdkAssets(): Promise<void> {
  // Only attempt network warm-up when online; SW will cache responses
  if (!navigator.onLine) return
  try {
    const resp = await fetch('/offline-export/precache.manifest.json', { cache: 'no-cache' })
    const all: string[] = resp.ok ? (await resp.json()) : []
    const priority = new Set<string>([
      '/offline-export/offline-export-app.js',
      '/sdk/offline-export-app.js',
      '/sdk/offline-export.css',
      '/sdk/export-private-key-viewer.js',
      '/sdk/iframe-export-bootstrap.js',
      '/sdk/export-viewer.css',
      '/sdk/export-iframe.css',
      '/offline-export/workers/web3authn-signer.worker.js',
      '/offline-export/workers/web3authn-vrf.worker.js',
      '/offline-export/workers/wasm_signer_worker_bg.wasm',
      '/offline-export/workers/wasm_vrf_worker_bg.wasm',
      '/sdk/workers/web3authn-signer.worker.js',
      '/sdk/workers/web3authn-vrf.worker.js',
      '/sdk/workers/wasm_signer_worker_bg.wasm',
      '/sdk/workers/wasm_vrf_worker_bg.wasm',
    ])
    const pri = Array.from(priority)
    const rest = all.filter((u) => !priority.has(u))
    await Promise.allSettled(pri.map((u) => fetch(u).then(() => void 0)))
    // Warm the remaining entries opportunistically
    const schedule = () => void Promise.allSettled(rest.map((u) => fetch(u).then(() => void 0)))
    try { (window as any).requestIdleCallback ? (window as any).requestIdleCallback(schedule, { timeout: 8000 }) : setTimeout(schedule, 800) } catch { setTimeout(schedule, 800) }
  } catch {}

  // Fallback: proactively cache any /sdk/* scripts that the offline page
  // already loaded as part of its initial bundle (e.g. common-*.js vendor chunks).
  // These are requested before the SW takes control, so we re-fetch them once
  // the SW is ready to ensure they are present in the offline cache.
  try {
    const origin = window.location.origin;
    const scriptPaths = Array.from(document.querySelectorAll('script[src]'))
      .map((el) => (el as HTMLScriptElement).src)
      .filter((src) => typeof src === 'string' && src.startsWith(origin + '/sdk/'))
      .map((src) => new URL(src).pathname);
    if (scriptPaths.length > 0) {
      await Promise.allSettled(
        scriptPaths.map((p) => fetch(p).then(() => void 0))
      );
    }
  } catch {}
}

function autoStartIfSingleUser(users: any[], selectedAccount: string, startExport: (acc: string) => Promise<void>): void {
  if (Array.isArray(users) && users.length === 1 && typeof selectedAccount === 'string' && selectedAccount) {
    setTimeout(() => { void startExport(selectedAccount) }, 0)
  }
}

function renderShell(message: string, canExport = false): HTMLButtonElement | null {
  document.documentElement.classList.add('w3a-transparent');
  document.body.classList.add('w3a-transparent');
  const root = document.createElement('div');
  root.className = 'offline-root'
  const h = document.createElement('h1');
  h.textContent = 'Offline Export';
  h.className = 'offline-title'
  const p = document.createElement('p');
  p.textContent = message;
  p.className = 'offline-desc'
  const info = document.createElement('div');
  info.className = 'offline-info';
  try {
    const tick = document.createElement('span');
    tick.className = 'offline-info-tick';
    tick.textContent = '✓';
    const label = document.createElement('span');
    label.textContent = ' Wallet origin: ';
    const url = document.createElement('a');
    url.className = 'offline-info-url';
    const origin = window.location.origin;
    url.href = origin;
    url.textContent = origin;
    url.target = '_blank';
    url.rel = 'noopener noreferrer';
    info.appendChild(tick);
    info.appendChild(label);
    info.appendChild(url);
  } catch {
    info.textContent = '✓ Wallet origin: (unknown)';
  }
  const btn = document.createElement('button');
  btn.textContent = 'Export My Key';
  btn.className = 'offline-btn'
  btn.disabled = !canExport;
  root.appendChild(h);
  root.appendChild(p);
  root.appendChild(info);
  root.appendChild(btn);
  document.body.appendChild(root);
  return canExport ? btn : null;
}

async function main(): Promise<void> {
  await registerServiceWorker();
  // Best-effort: warm critical SDK assets so offline flow is reliable.
  // Do not block first paint — fire-and-forget.
  void prewarmSdkAssets();
  try {
    // Ensure worker scripts resolve under SW scope so their subresource fetches (WASM) are controlled
    (window as any).__W3A_SIGNER_WORKER_URL__ = '/offline-export/workers/web3authn-signer.worker.js'
    ;(window as any).__W3A_VRF_WORKER_URL__ = '/offline-export/workers/web3authn-vrf.worker.js'
    const rpOverrideFromMeta = (() => {
      const m = document.querySelector('meta[name="tatchi-rpid-base"]') as HTMLMetaElement | null;
      const v = (m?.content || '').trim();
      return v || undefined;
    })();
    const deriveBaseDomain = (host: string): string | undefined => {
      const parts = (host || '').split('.');
      // Heuristic: use registrable suffix for dev hosts like wallet.example.localhost
      return parts.length >= 3 ? parts.slice(1).join('.') : undefined;
    };
    const inferredBase = deriveBaseDomain(window.location.hostname);
    const effectiveRpIdOverride = rpOverrideFromMeta || inferredBase;
    // Detect last user (same origin IndexedDB)
    const last = await IndexedDBManager.clientDB.getLastUser();
    const users = await IndexedDBManager.clientDB.getAllUsers().catch(() => []);

    // Optional preselected account via query string
    const qs = new URLSearchParams((window.location && window.location.search) || '')
    const qsAccountRaw = (qs.get('accountId') || '').trim()
    const qsAccount = qsAccountRaw ? String(toAccountId(qsAccountRaw)) : ''

    // Container: message + optional account selector + button + status line
    const defaultAccount = qsAccount || (last?.nearAccountId || '')
    if (!defaultAccount) {
      renderShell('No local account found on this device. Open the wallet once online on this device to prime offline export.');
      return;
    }
    const btn = renderShell('Authenticate with Touch ID/biometrics to export keys offline.', true);
    if (!btn) return;
    const container = btn.parentElement as HTMLDivElement;

    // Optional account selector when multiple local users exist
    let selectedAccount = defaultAccount as string;
    if (Array.isArray(users) && users.length > 1) {
      const label = document.createElement('label');
      label.textContent = 'Choose account:';
      label.className = 'offline-label'
      const sel = document.createElement('select');
      sel.className = 'offline-select'
      for (const u of users) {
        const opt = document.createElement('option');
        opt.value = (u as any).nearAccountId;
        opt.textContent = (u as any).nearAccountId;
        if ((u as any).nearAccountId === selectedAccount) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => { selectedAccount = sel.value; statusEl.textContent = ''; });
      container.insertBefore(sel, btn);
      container.insertBefore(label, sel);
    }

    // Status line for inline errors/info
    const statusEl = document.createElement('div');
    statusEl.className = 'offline-status'
    container.appendChild(statusEl);

    // Pre-flight: soft-check for local authenticators (do not block)
    async function ensureLocalAuthenticators(acc: string): Promise<any[]> {
      try {
        const authenticators = await IndexedDBManager.clientDB.getAuthenticatorsByUser(acc as any);
        if (!Array.isArray(authenticators) || authenticators.length === 0) {
          console.warn('[offline-export] No local passkeys in IndexedDB; proceeding (resident credentials may still be available)');
          statusEl.textContent = 'Tip: open the wallet on this device once online to prime offline export. If a passkey exists on this device, you can still proceed.';
          return [];
        }
        return authenticators;
      } catch (e) {
        console.warn('[offline-export] Failed to read authenticators; proceeding anyway', e);
        return [];
      }
    }

    let started = false;
    const defaultBtnLabel = btn.textContent || 'Export My Key';
    const startExport = async (account: string) => {
      if (started) return;
      started = true;
      btn.disabled = true;
      btn.classList.add('loading');
      try { btn.textContent = 'Exporting…'; btn.setAttribute('aria-busy', 'true'); } catch {}
      statusEl.textContent = '';
      try {
        // Soft-check (non-blocking) — we may still have resident credentials
        const authenticators = await ensureLocalAuthenticators(account);

        // Instantiate WebAuthnManager with minimal offline configs. No network RPC is used in export flow.
        const near = new MinimalNearClient('https://rpc.invalid.local');
        const offlineConfigsInput: TatchiConfigsInput = {
          nearRpcUrl: 'https://rpc.invalid.local',
          nearNetwork: 'testnet',
          contractId: 'w3a-v1.testnet',
          initialTheme: 'dark',
          iframeWallet: effectiveRpIdOverride ? { rpIdOverride: effectiveRpIdOverride } : undefined,
          relayer: {
            url: 'https://rpc.invalid.local',
          },
        };
        const offlineConfigs = buildConfigsFromEnv(offlineConfigsInput);
        const webAuthnManager = new WebAuthnManager(offlineConfigs, near);
        console.debug('[offline-export] rpId (hostname):', window.location.hostname);
        if (effectiveRpIdOverride) {
          console.debug('[offline-export] rpIdOverride:', effectiveRpIdOverride);
        }
        try {
          // Attempt direct export using WebAuthnManager's worker-driven flow
          await webAuthnManager.exportNearKeypairWithUI(toAccountId(account), {
            variant: 'drawer',
            theme: 'dark',
          });
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          const isMissingLocalKeyMaterial = msg.includes('Missing local key material for export');
          const isAeadDecryptMismatch =
            msg.includes('Decryption failed: Decryption error: aead::Error') || msg.includes('aead::Error');

          if (isMissingLocalKeyMaterial || isAeadDecryptMismatch) {
            // Attempt local recovery of key material from passkey, then retry
            statusEl.textContent = isAeadDecryptMismatch
              ? 'Decryption failed. Attempting recovery with your passkey…'
              : 'Missing local key material. Attempting recovery with your passkey…';
            const tip = new TouchIdPrompt(effectiveRpIdOverride);
            const challenge = createRandomVRFChallenge() as VRFChallenge;
            const allowCredentials = Array.isArray(authenticators) && authenticators.length > 0
              ? authenticators.map((a: any) => ({ id: a.credentialId, type: 'public-key', transports: a.transports as any }))
              : [];
            const authCred = await tip.getAuthenticationCredentialsSerializedDualPrf({
              nearAccountId: account,
              challenge,
              allowCredentials,
            });
            // Recover NEAR keypair using WebAuthnManager's recovery flow
            const rec = await webAuthnManager.recoverKeypairFromPasskey(authCred, account);
            if (!rec.wrapKeySalt) {
              throw new Error('Missing wrapKeySalt in recovered key material; re-register to upgrade vault format.');
            }
            // Store encrypted key locally for this device. Prefer the last logged-in
            // device for this account; fall back to device 1 for legacy cases.
            const accountId = toAccountId(account);
            const [last, latest] = await Promise.all([
              IndexedDBManager.clientDB.getLastUser().catch(() => null),
              IndexedDBManager.clientDB.getLastDBUpdatedUser(accountId).catch(() => null),
            ]);
            const deviceNumber =
              (last && last.nearAccountId === accountId && typeof last.deviceNumber === 'number')
                ? last.deviceNumber
                : (latest && latest.nearAccountId === accountId && typeof latest.deviceNumber === 'number')
                  ? latest.deviceNumber
                  : 1;

            // Safety check: only overwrite local vault material if the recovered public key
            // matches what we already have for this account/device.
            const existing = await IndexedDBManager.clientDB.getUserByDevice(accountId, deviceNumber).catch(() => null);
            if (isAeadDecryptMismatch && !existing) {
              throw new Error(
                `Decryption failed and no local user record was found for '${account}'. ` +
                'Open the wallet once online on this device to restore local vault state, then retry offline export.'
              );
            }
            const expectedPublicKey = String(existing?.clientNearPublicKey || '');
            if (expectedPublicKey && expectedPublicKey !== rec.publicKey) {
              throw new Error(
                `Selected passkey does not match the existing key for '${account}'. ` +
                'Please select the correct passkey for this account and try again.'
              );
            }

            await IndexedDBManager.nearKeysDB.storeKeyMaterial({
              kind: 'local_near_sk_v3',
              nearAccountId: account,
              deviceNumber,
              publicKey: rec.publicKey,
              encryptedSk: rec.encryptedPrivateKey,
              chacha20NonceB64u: rec.chacha20NonceB64u,
              wrapKeySalt: rec.wrapKeySalt,
              timestamp: Date.now(),
            });
            // Upsert public key if missing for this device
            if (!existing?.clientNearPublicKey) {
              try { await IndexedDBManager.clientDB.updateUser(accountId, { clientNearPublicKey: rec.publicKey }); } catch {}
            }
            statusEl.textContent = 'Recovered local key material. Opening export viewer…';
            await webAuthnManager.exportNearKeypairWithUI(toAccountId(account), {
              variant: 'drawer',
              theme: 'dark',
            });
          } else {
            throw err;
          }
        }
        // Notify parent (overlay controllers) that the export UI has been shown
        window.parent?.postMessage?.({ type: OFFLINE_EXPORT_DONE, nearAccountId: account }, '*');
      } catch (e: any) {
        console.error('[offline-export] export failed', e);
        const msg = String(e?.message || e || '');
        if (msg.includes('User cancelled secure confirm request')) {
          // Differentiate common NotAllowedError path vs explicit cancel
          statusEl.textContent = `No matching passkeys for this origin or the prompt was cancelled. Ensure this device has a passkey for '${account}' on ${window.location.hostname}, then try again.`;
        } else if (msg.includes('NotAllowedError')) {
          statusEl.textContent = `No matching passkeys available for '${account}' on this device.`;
        } else if (msg.includes('Missing local key material')) {
          statusEl.textContent = 'Missing local key material for export. Open the wallet on this device once online to prime offline export.';
        } else {
          statusEl.textContent = 'Export failed: ' + msg;
        }
        window.parent?.postMessage?.({ type: OFFLINE_EXPORT_ERROR, error: msg }, '*');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        try { btn.textContent = defaultBtnLabel; btn.removeAttribute('aria-busy'); } catch {}
        started = false;
      }
    };

    // Click handler uses current selected account
    btn.addEventListener('click', async () => { await startExport(selectedAccount); });
  } catch (e) {
    console.error('[offline-export] bootstrap failed', e);
    renderShell('Failed to initialize offline export on this device.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main());
} else {
  void main();
}

export {}
