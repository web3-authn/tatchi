import React from 'react';

import type { EmailRecoverySSEEvent } from '@/core/types/sdkSentEvents';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import { IndexedDBManager } from '@/core/IndexedDBManager';
import { toAccountId } from '@/core/types/accountIds';

export interface EmailRecoverySlideProps {
  tatchiPasskey: TatchiPasskey;
  accountId: string;
  refreshLoginState?: (nearAccountId?: string) => Promise<void>;
  emailRecoveryOptions?: {
    onEvent?: (event: EmailRecoverySSEEvent) => void;
    onError?: (error: Error) => void;
  };
}

type EmailRecoveryPolicy = {
  minRequiredEmails?: number;
  maxAgeMs?: number;
};

type EmailRecoveryAccountInfo = {
  emailsCount: number;
};

type MailtoUiState = 'ready' | 'opening';

export const EmailRecoverySlide: React.FC<EmailRecoverySlideProps> = ({ tatchiPasskey, accountId, refreshLoginState, emailRecoveryOptions }) => {
  const mountedRef = React.useRef(true);
  const mailtoAttemptTimerRef = React.useRef<number | null>(null);
  const cancelRequestedRef = React.useRef(false);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (mailtoAttemptTimerRef.current != null) {
        window.clearTimeout(mailtoAttemptTimerRef.current);
        mailtoAttemptTimerRef.current = null;
      }
    };
  }, []);

  const [isBusy, setIsBusy] = React.useState(false);
  const [accountIdInput, setAccountIdInput] = React.useState('');
  const [recoveryEmailInput, setRecoveryEmailInput] = React.useState('');
  const [pendingMailtoUrl, setPendingMailtoUrl] = React.useState<string | null>(null);
  const [mailtoUiState, setMailtoUiState] = React.useState<MailtoUiState>('ready');
  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [pollingElapsedMs, setPollingElapsedMs] = React.useState<number | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [accountInfo, setAccountInfo] = React.useState<EmailRecoveryAccountInfo | null>(null);
  const [accountInfoLoading, setAccountInfoLoading] = React.useState(false);
  const [accountInfoError, setAccountInfoError] = React.useState<string | null>(null);
  const [localRecoveryEmails, setLocalRecoveryEmails] = React.useState<string[]>([]);
  const [explorerToast, setExplorerToast] = React.useState<{ url: string; accountId?: string; transactionHash?: string } | null>(null);

  const lastPrefilledAccountIdRef = React.useRef<string>('');
  const lastPrefilledRecoveryEmailRef = React.useRef<string>('');

  React.useEffect(() => {
    const next = (accountId || '').trim();
    if (!next) return;
    if (accountIdInput.trim() === '' || accountIdInput === lastPrefilledAccountIdRef.current) {
      lastPrefilledAccountIdRef.current = next;
      setAccountIdInput(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  React.useEffect(() => {
    setPendingMailtoUrl(null);
    setMailtoUiState('ready');
    cancelRequestedRef.current = false;
    setStatusText(null);
    setPollingElapsedMs(null);
    setErrorText(null);
    setAccountInfo(null);
    setAccountInfoError(null);
    setLocalRecoveryEmails([]);
    setExplorerToast(null);
    if (mailtoAttemptTimerRef.current != null) {
      window.clearTimeout(mailtoAttemptTimerRef.current);
      mailtoAttemptTimerRef.current = null;
    }
  }, [accountId]);

  const safeSet = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: React.SetStateAction<T>) => {
      if (!mountedRef.current) return;
      setter(value);
    };
  };

  const safeSetPendingMailtoUrl = React.useMemo(() => safeSet(setPendingMailtoUrl), []);
  const safeSetStatusText = React.useMemo(() => safeSet(setStatusText), []);
  const safeSetPollingElapsedMs = React.useMemo(() => safeSet(setPollingElapsedMs), []);
  const safeSetErrorText = React.useMemo(() => safeSet(setErrorText), []);
  const safeSetIsBusy = React.useMemo(() => safeSet(setIsBusy), []);
  const safeSetAccountInfo = React.useMemo(() => safeSet(setAccountInfo), []);
  const safeSetAccountInfoLoading = React.useMemo(() => safeSet(setAccountInfoLoading), []);
  const safeSetAccountInfoError = React.useMemo(() => safeSet(setAccountInfoError), []);
  const safeSetLocalRecoveryEmails = React.useMemo(() => safeSet(setLocalRecoveryEmails), []);
  const safeSetExplorerToast = React.useMemo(() => safeSet(setExplorerToast), []);
  const safeSetMailtoUiState = React.useMemo(() => safeSet(setMailtoUiState), []);

  const onEvent = React.useCallback(
    (ev: EmailRecoverySSEEvent) => {
      if (cancelRequestedRef.current) return;
      safeSetStatusText(ev?.message || null);
      emailRecoveryOptions?.onEvent?.(ev);

      const data = (ev as any)?.data || {};
      const rawTxHash = data?.transactionHash ?? data?.transaction_hash;
      const txHash = typeof rawTxHash === 'string' ? rawTxHash.trim() : '';
      if (txHash) {
        const base = String(tatchiPasskey.configs?.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
        const url = base.includes('nearblocks.io')
          ? `${base}/txns/${txHash}`
          : `${base}/transactions/${txHash}`;
        safeSetExplorerToast({ url, transactionHash: txHash });
      }
      const elapsedRaw = data?.elapsedMs ?? data?.elapsed_ms;
      if (elapsedRaw == null) safeSetPollingElapsedMs(null);
      const elapsed = elapsedRaw == null ? Number.NaN : Number(elapsedRaw);
      if (!Number.isNaN(elapsed)) safeSetPollingElapsedMs(elapsed);

      if (ev?.phase === 'email-recovery-error' || (ev as any)?.status === 'error') {
        const raw = (ev as any)?.error || ev?.message || 'Email recovery failed';
        safeSetErrorText(String(raw));
      }
    },
    [emailRecoveryOptions, safeSetErrorText, safeSetExplorerToast, safeSetPollingElapsedMs, safeSetStatusText, tatchiPasskey],
  );

  const showExplorerToast = React.useCallback(
    (rawAccountId: string) => {
      const normalized = (rawAccountId || '').trim();
      if (!normalized) return;
      const base = String(tatchiPasskey.configs?.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
      const url = base.includes('nearblocks.io')
        ? `${base}/address/${normalized}`
        : `${base}/accounts/${normalized}`;

      safeSetExplorerToast({ url, accountId: normalized });
    },
    [safeSetExplorerToast, tatchiPasskey],
  );

  const launchMailto = React.useCallback((rawMailtoUrl: string) => {
    const url = String(rawMailtoUrl || '').trim();
    if (!url) return;

    if (typeof window !== 'undefined') {
      try {
        window.location.href = url;
      } catch {}
    }
  }, []);

  const attemptOpenMailtoFromUserGesture = React.useCallback(
    (rawMailtoUrl: string) => {
      const url = String(rawMailtoUrl || '').trim();
      if (!url) return;

      safeSetMailtoUiState('opening');

      if (mailtoAttemptTimerRef.current != null) {
        window.clearTimeout(mailtoAttemptTimerRef.current);
      }

      // If the browser never blurs/hides (i.e. mailto blocked or cancelled), re-enable so users can retry.
      mailtoAttemptTimerRef.current = window.setTimeout(() => {
        safeSetMailtoUiState(prev => (prev === 'opening' ? 'ready' : prev));
        mailtoAttemptTimerRef.current = null;
      }, 2_000);

      launchMailto(url);
    },
    [launchMailto, safeSetMailtoUiState],
  );

  const attemptOpenMailtoAuto = React.useCallback(
    (rawMailtoUrl: string) => {
      const url = String(rawMailtoUrl || '').trim();
      if (!url) return;
      // Best-effort only: do not change `mailtoUiState` so users can immediately click the CTA.
      launchMailto(url);
    },
    [launchMailto],
  );

  React.useEffect(() => {
    if (mailtoUiState !== 'opening') return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Heuristic signals that the mail client likely opened. Treat as a hint only:
    // re-enable immediately so the CTA remains retryable even if this is a false-positive.
    const markMaybeOpened = () => {
      safeSetMailtoUiState('ready');
      if (mailtoAttemptTimerRef.current != null) {
        window.clearTimeout(mailtoAttemptTimerRef.current);
        mailtoAttemptTimerRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markMaybeOpened();
    };

    window.addEventListener('blur', markMaybeOpened);
    window.addEventListener('pagehide', markMaybeOpened);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('blur', markMaybeOpened);
      window.removeEventListener('pagehide', markMaybeOpened);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [mailtoUiState, safeSetMailtoUiState]);

  const fetchLocalRecoveryEmailsFromIndexedDB = React.useCallback(
    async (rawAccountId: string): Promise<string[]> => {
      const normalized = (rawAccountId || '').trim();
      if (!normalized) {
        console.log('[EmailRecoverySlide] fetchLocalRecoveryEmails: empty accountId');
        return [];
      }

      try {
        console.log('[EmailRecoverySlide] fetchLocalRecoveryEmails: loading from IndexedDB', { accountId: normalized });
        const records = await IndexedDBManager.getRecoveryEmails(toAccountId(normalized));
        console.log('[EmailRecoverySlide] fetchLocalRecoveryEmails: raw IndexedDB records', {
          accountId: normalized,
          count: Array.isArray(records) ? records.length : 0,
          records,
        });
        if (!Array.isArray(records) || records.length === 0) return [];

        const sorted = [...records].sort((a, b) => (b?.addedAt || 0) - (a?.addedAt || 0));
        const emails = sorted
          .map(r => String(r?.email || '').trim().toLowerCase())
          .filter(e => !!e && e.includes('@'));

        const uniq = Array.from(new Set(emails));
        console.log('[EmailRecoverySlide] fetchLocalRecoveryEmails: parsed emails', {
          accountId: normalized,
          emails: uniq,
        });
        return uniq;
      } catch (err) {
        // best-effort; treat as no saved emails (e.g., IndexedDB unavailable)
        console.log('[EmailRecoverySlide] fetchLocalRecoveryEmails: failed to read IndexedDB', {
          accountId: normalized,
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    },
    [],
  );

  const deriveEmailsFromRecoveryRecords = React.useCallback((records: unknown): string[] => {
    if (!Array.isArray(records) || records.length === 0) return [];
    const emails = records
      .map((r: any) => String(r?.email || '').trim().toLowerCase())
      .filter((e: string) => !!e && e.includes('@'));
    return Array.from(new Set(emails));
  }, []);

  React.useEffect(() => {
    const normalized = (accountIdInput || '').trim();
    if (!normalized) {
      setAccountInfo(null);
    setAccountInfoError(null);
    setAccountInfoLoading(false);
    safeSetLocalRecoveryEmails([]);
    return;
  }

    let cancelled = false;
    // Show loading state immediately (don't wait for debounce).
    safeSetAccountInfoLoading(true);
    safeSetAccountInfoError(null);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const isWalletIframeMode = !!tatchiPasskey.configs?.iframeWallet?.walletOrigin;

          // Legacy mode: suggest recovery emails from local IndexedDB mapping (best-effort).
          let localEmails: string[] = [];
          if (!isWalletIframeMode) {
            localEmails = await fetchLocalRecoveryEmailsFromIndexedDB(normalized);
            if (!cancelled) {
              console.log('[EmailRecoverySlide] local saved emails (IndexedDB)', { accountId: normalized, localEmails });
            }
          }

          const records = await tatchiPasskey.getRecoveryEmails(normalized);
          const resolvedEmails = isWalletIframeMode
            ? deriveEmailsFromRecoveryRecords(records)
            : localEmails;

          if (!cancelled) {
            safeSetLocalRecoveryEmails(resolvedEmails);
            console.log('[EmailRecoverySlide] recovery email suggestions (state)', { accountId: normalized, emails: resolvedEmails });

            if (
              resolvedEmails.length === 1 &&
              (recoveryEmailInput.trim() === '' || recoveryEmailInput === lastPrefilledRecoveryEmailRef.current)
            ) {
              lastPrefilledRecoveryEmailRef.current = resolvedEmails[0];
              setRecoveryEmailInput(resolvedEmails[0]);
            }
          }

          const info: EmailRecoveryAccountInfo | null = records
            ? { emailsCount: Array.isArray(records) ? records.length : 0 }
            : null;
          if (cancelled) return;
          safeSetAccountInfo(info);
        } catch (err: any) {
          if (cancelled) return;
          safeSetAccountInfo(null);
          safeSetAccountInfoError(err?.message || 'Failed to load email recovery settings for this account');
        } finally {
          if (!cancelled) safeSetAccountInfoLoading(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    accountIdInput,
    deriveEmailsFromRecoveryRecords,
    fetchLocalRecoveryEmailsFromIndexedDB,
    recoveryEmailInput,
    safeSetAccountInfo,
    safeSetAccountInfoError,
    safeSetAccountInfoLoading,
    safeSetLocalRecoveryEmails,
    tatchiPasskey,
  ]);

  const handleStart = React.useCallback(async () => {
    const normalizedAccountId = (accountIdInput || '').trim();
    if (!normalizedAccountId) {
      safeSetErrorText('Enter an account ID.');
      return;
    }

    const emailCandidate = (recoveryEmailInput || '').trim().toLowerCase();
    if (!emailCandidate) {
      safeSetErrorText('Enter the recovery email to send from.');
      return;
    }

    safeSetIsBusy(true);
    cancelRequestedRef.current = false;
    safeSetErrorText(null);
    safeSetStatusText(null);
    safeSetPollingElapsedMs(null);
    safeSetPendingMailtoUrl(null);
    safeSetMailtoUiState('ready');

    let didForwardError = false;
    try {
      const result = await tatchiPasskey.startEmailRecovery({
        accountId: normalizedAccountId,
        recoveryEmail: emailCandidate,
        options: {
          onEvent,
          onError: (err: Error) => {
            if (cancelRequestedRef.current) return;
            safeSetErrorText(err?.message || 'Failed to start email recovery');
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
          afterCall: async () => {},
        } as any,
      });

      safeSetPendingMailtoUrl(result.mailtoUrl);
      safeSetStatusText('Recovery email draft ready. If it didn’t open automatically, click “Open recovery email draft”. Waiting for verification…');

      // Best-effort open. If blocked/cancelled, the CTA remains immediately clickable for a user-gesture retry.
      attemptOpenMailtoAuto(result.mailtoUrl);

      // Start polling immediately after attempting to open the email prompt.
      const finalizePromise = tatchiPasskey.finalizeEmailRecovery({
        accountId: normalizedAccountId,
        nearPublicKey: result.nearPublicKey,
        options: {
          onEvent,
          onError: (err: Error) => {
            if (cancelRequestedRef.current) return;
            safeSetErrorText(err?.message || 'Failed to finalize email recovery');
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
          afterCall: async () => {},
        } as any,
      });

      showExplorerToast(normalizedAccountId);

      await finalizePromise;

      // Best-effort auto-login: the core flow attempts it, but if it couldn't (e.g. missing Shamir
      // auto-unlock and user cancelled TouchID), try once more here.
      let loginOk = false;
      const session = await tatchiPasskey.getLoginSession(normalizedAccountId).catch(() => null);
      if (session?.login?.isLoggedIn) {
        loginOk = true;
      } else {
        safeSetStatusText('Email recovery completed. Logging you in…');
        loginOk = await tatchiPasskey.loginAndCreateSession(normalizedAccountId)
          .then(() => true)
          .catch(() => false);
      }

      if (refreshLoginState) {
        await refreshLoginState(normalizedAccountId).catch(() => {});
      }

      safeSetStatusText(loginOk ? 'Email recovery completed on this device.' : 'Email recovery completed. Please log in on this device.');
      safeSetPendingMailtoUrl(null);
      safeSetMailtoUiState('ready');
      safeSetPollingElapsedMs(null);
    } catch (err: any) {
      if (cancelRequestedRef.current) {
        safeSetErrorText('Email recovery cancelled. Please try again.');
        safeSetStatusText(null);
        safeSetPollingElapsedMs(null);
        safeSetPendingMailtoUrl(null);
        safeSetMailtoUiState('ready');
        return;
      }
      safeSetErrorText(err?.message || 'Failed to start email recovery');
      if (!didForwardError && err instanceof Error) {
        emailRecoveryOptions?.onError?.(err);
      }
    } finally {
      safeSetIsBusy(false);
    }
  }, [
    accountIdInput,
    emailRecoveryOptions,
    recoveryEmailInput,
    onEvent,
    refreshLoginState,
    showExplorerToast,
    safeSetErrorText,
    safeSetIsBusy,
    safeSetPendingMailtoUrl,
    safeSetPollingElapsedMs,
    safeSetStatusText,
    safeSetMailtoUiState,
    attemptOpenMailtoAuto,
    tatchiPasskey,
  ]);

  const summaryLine = accountInfoLoading
    ? 'Checking if account has recovery emails configured...'
    : accountInfo && !accountInfoError
      ? `Recovery emails configured: ${accountInfo.emailsCount}`
      : '\u00A0';

  const noRecoveryEmailsConfigured =
    !accountInfoLoading && !accountInfoError && !!accountInfo && accountInfo.emailsCount === 0;

  return (
    <div className="w3a-email-recovery-slide">
      <div className="w3a-email-recovery-title">Recover Account with Email</div>
      <div className="w3a-email-recovery-help">
        Send a special recovery email from your recovery email address.
        Your account will be recovered with a new key once the email is verified.
      </div>

      <div className="w3a-email-recovery-field">
        <div className="w3a-input-pill w3a-email-recovery-input-pill">
          <div className="w3a-input-wrap">
            <input
              type="text"
              value={accountIdInput}
              onChange={(e) => setAccountIdInput(e.target.value)}
              placeholder="NEAR account ID (e.g. alice.testnet)"
              className="w3a-input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              disabled={isBusy}
            />
          </div>
        </div>
      </div>

      <div className="w3a-email-recovery-summary" aria-live="polite">
        <div>{summaryLine}</div>
      </div>

      <div className="w3a-email-recovery-field">
        <div className="w3a-input-pill w3a-email-recovery-input-pill">
          <div className="w3a-input-wrap">
            <input
              type="email"
              value={recoveryEmailInput}
              onChange={(e) => setRecoveryEmailInput(e.target.value)}
              placeholder="Recovery email to send from"
              className="w3a-input"
              list={localRecoveryEmails.length > 0 ? 'w3a-email-recovery-saved-emails' : undefined}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              disabled={isBusy || noRecoveryEmailsConfigured}
            />
          </div>
        </div>
      </div>

      {localRecoveryEmails.length > 0 && (
        <div className="w3a-email-recovery-summary" aria-live="polite">
          <div>Saved on this device:</div>
          <div className="w3a-email-recovery-saved-emails">
            {localRecoveryEmails.map((email) => (
              <button
                key={email}
                type="button"
                className="w3a-email-recovery-email-chip"
                onClick={() => setRecoveryEmailInput(email)}
                disabled={isBusy}
              >
                {email}
              </button>
            ))}
          </div>
        </div>
      )}

      {localRecoveryEmails.length > 0 && (
        <datalist id="w3a-email-recovery-saved-emails">
          {localRecoveryEmails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>
      )}

      <div className="w3a-email-recovery-actions">
        {(!pendingMailtoUrl || !isBusy) && (
          <button
            onClick={handleStart}
            className="w3a-link-device-btn w3a-link-device-btn-primary"
            disabled={isBusy || noRecoveryEmailsConfigured}
          >
            {noRecoveryEmailsConfigured ? 'No recovery emails configured' : (isBusy ? 'Working…' : 'Start Email Recovery')}
          </button>
        )}

        {pendingMailtoUrl && (
          <button
            type="button"
            onClick={() => attemptOpenMailtoFromUserGesture(pendingMailtoUrl)}
            className="w3a-link-device-btn w3a-link-device-btn-primary"
            disabled={mailtoUiState === 'opening'}
            aria-busy={mailtoUiState === 'opening'}
          >
            {mailtoUiState === 'opening' && <span className="w3a-spinner" aria-hidden="true" />}
            {mailtoUiState === 'opening' ? 'Opening email…' : 'Open recovery email draft'}
          </button>
        )}
      </div>

      {(errorText || statusText || explorerToast) && (
        <div className={`w3a-email-recovery-status${errorText ? ' is-error' : ''}`}>
          {errorText ? errorText : statusText}
          {pollingElapsedMs != null && !Number.isNaN(pollingElapsedMs) && pollingElapsedMs > 0 && (
            <span className="w3a-email-recovery-elapsed">
              (~{Math.round(pollingElapsedMs / 1000)}s).
            </span>
          )}
          {explorerToast && (
            <>
              <br />
              <a className="w3a-email-recovery-link" href={explorerToast.url} target="_blank" rel="noopener noreferrer">
                View on explorer
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailRecoverySlide;
