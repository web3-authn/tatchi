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

export const EmailRecoverySlide: React.FC<EmailRecoverySlideProps> = ({ tatchiPasskey, accountId, refreshLoginState, emailRecoveryOptions }) => {
  const mountedRef = React.useRef(true);
  const explorerToastTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (explorerToastTimerRef.current != null) {
        window.clearTimeout(explorerToastTimerRef.current);
        explorerToastTimerRef.current = null;
      }
    };
  }, []);

  const [isBusy, setIsBusy] = React.useState(false);
  const [accountIdInput, setAccountIdInput] = React.useState('');
  const [recoveryEmailInput, setRecoveryEmailInput] = React.useState('');
  const [pendingMailtoUrl, setPendingMailtoUrl] = React.useState<string | null>(null);
  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [pollingElapsedMs, setPollingElapsedMs] = React.useState<number | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [accountInfo, setAccountInfo] = React.useState<EmailRecoveryAccountInfo | null>(null);
  const [accountInfoLoading, setAccountInfoLoading] = React.useState(false);
  const [accountInfoError, setAccountInfoError] = React.useState<string | null>(null);
  const [localRecoveryEmails, setLocalRecoveryEmails] = React.useState<string[]>([]);
  const [explorerToast, setExplorerToast] = React.useState<{ url: string; accountId: string } | null>(null);

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
    setStatusText(null);
    setPollingElapsedMs(null);
    setErrorText(null);
    setAccountInfo(null);
    setAccountInfoError(null);
    setLocalRecoveryEmails([]);
    setExplorerToast(null);
    if (explorerToastTimerRef.current != null) {
      window.clearTimeout(explorerToastTimerRef.current);
      explorerToastTimerRef.current = null;
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

  const onEvent = React.useCallback(
    (ev: EmailRecoverySSEEvent) => {
      safeSetStatusText(ev?.message || null);
      emailRecoveryOptions?.onEvent?.(ev);

      const data = (ev as any)?.data || {};
      const elapsedRaw = data?.elapsedMs ?? data?.elapsed_ms;
      const elapsed = elapsedRaw == null ? Number.NaN : Number(elapsedRaw);
      if (!Number.isNaN(elapsed)) safeSetPollingElapsedMs(elapsed);

      if (ev?.phase === 'email-recovery-error' || (ev as any)?.status === 'error') {
        const raw = (ev as any)?.error || ev?.message || 'Email recovery failed';
        safeSetErrorText(String(raw));
      }
    },
    [emailRecoveryOptions, safeSetStatusText, safeSetPollingElapsedMs, safeSetErrorText],
  );

  const showExplorerToast = React.useCallback(
    (rawAccountId: string) => {
      const normalized = (rawAccountId || '').trim();
      if (!normalized) return;
      const base = String(tatchiPasskey.configs?.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
      const url = `${base}/address/${normalized}`;

      safeSetExplorerToast({ url, accountId: normalized });

      if (explorerToastTimerRef.current != null) {
        window.clearTimeout(explorerToastTimerRef.current);
      }
      explorerToastTimerRef.current = window.setTimeout(() => {
        safeSetExplorerToast(null);
        explorerToastTimerRef.current = null;
      }, 12_000);
    },
    [safeSetExplorerToast, tatchiPasskey],
  );

  const fetchLocalRecoveryEmails = React.useCallback(
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

  const fetchAccountInfo = React.useCallback(
    async (rawAccountId: string): Promise<EmailRecoveryAccountInfo | null> => {
      const normalized = (rawAccountId || '').trim();
      if (!normalized) return null;

      const records = await tatchiPasskey.getRecoveryEmails(normalized);

      return {
        emailsCount: Array.isArray(records) ? records.length : 0,
      };
    },
    [tatchiPasskey],
  );

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
          const localEmails = await fetchLocalRecoveryEmails(normalized);
          if (!cancelled) {
            safeSetLocalRecoveryEmails(localEmails);
            console.log('[EmailRecoverySlide] local saved emails (state)', { accountId: normalized, localEmails });

            if (
              localEmails.length === 1 &&
              (recoveryEmailInput.trim() === '' || recoveryEmailInput === lastPrefilledRecoveryEmailRef.current)
            ) {
              lastPrefilledRecoveryEmailRef.current = localEmails[0];
              setRecoveryEmailInput(localEmails[0]);
              console.log('[EmailRecoverySlide] auto-filled recoveryEmailInput from IndexedDB', {
                accountId: normalized,
                email: localEmails[0],
              });
            }
          }

          const info = await fetchAccountInfo(normalized);
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
    fetchAccountInfo,
    fetchLocalRecoveryEmails,
    recoveryEmailInput,
    safeSetAccountInfo,
    safeSetAccountInfoError,
    safeSetAccountInfoLoading,
    safeSetLocalRecoveryEmails,
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
    safeSetErrorText(null);
    safeSetStatusText(null);
    safeSetPollingElapsedMs(null);
    safeSetPendingMailtoUrl(null);

    let didForwardError = false;
    try {
      const result = await tatchiPasskey.startEmailRecovery({
        accountId: normalizedAccountId,
        recoveryEmail: emailCandidate,
        options: {
          onEvent,
          onError: (err: Error) => {
            safeSetErrorText(err?.message || 'Failed to start email recovery');
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
          afterCall: async () => {},
        } as any,
      });

      safeSetPendingMailtoUrl(result.mailtoUrl);
      safeSetStatusText('Recovery email draft ready. Send it from your recovery address. Waiting for verification…');

      try {
        window.open(result.mailtoUrl, '_blank', 'noopener,noreferrer');
      } catch {
        // best-effort; link remains visible
      }

      showExplorerToast(normalizedAccountId);

      await tatchiPasskey.finalizeEmailRecovery({
        accountId: normalizedAccountId,
        nearPublicKey: result.nearPublicKey,
        options: {
          onEvent,
          onError: (err: Error) => {
            safeSetErrorText(err?.message || 'Failed to finalize email recovery');
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
          afterCall: async () => {},
        } as any,
      });

      // Best-effort auto-login: the core flow attempts it, but if it couldn't (e.g. missing Shamir
      // auto-unlock and user cancelled TouchID), try once more here.
      let loginOk = false;
      try {
        const session = await tatchiPasskey.getLoginSession(normalizedAccountId);
        if (session?.login?.isLoggedIn) {
          loginOk = true;
        } else {
          safeSetStatusText('Email recovery completed. Logging you in…');
          await tatchiPasskey.loginAndCreateSession(normalizedAccountId);
          loginOk = true;
        }
      } catch {
        loginOk = false;
      }

      try {
        await refreshLoginState?.(normalizedAccountId);
      } catch {
        // ignore
      }

      safeSetStatusText(loginOk ? 'Email recovery completed on this device.' : 'Email recovery completed. Please log in on this device.');
      safeSetPendingMailtoUrl(null);
      safeSetPollingElapsedMs(null);
    } catch (err: any) {
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
        <button
          onClick={handleStart}
          className="w3a-link-device-btn w3a-link-device-btn-primary"
          disabled={isBusy || noRecoveryEmailsConfigured}
        >
          {noRecoveryEmailsConfigured ? 'No recovery emails configured' : (isBusy ? 'Working…' : 'Start Email Recovery')}
        </button>
      </div>

      {pendingMailtoUrl && (
        <a className="w3a-email-recovery-link" href={pendingMailtoUrl}>
          Open recovery email draft
        </a>
      )}

      {explorerToast && (
        <div className="w3a-email-recovery-toast" role="status" aria-live="polite">
          <span>View on explorer:</span>
          <a href={explorerToast.url} target="_blank" rel="noopener noreferrer">
            {explorerToast.accountId}
          </a>
          <button
            type="button"
            className="w3a-email-recovery-toast-close"
            onClick={() => safeSetExplorerToast(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {(errorText || statusText) && (
        <div className={`w3a-email-recovery-status${errorText ? ' is-error' : ''}`}>
          {errorText ? errorText : statusText}
          {pollingElapsedMs != null && !Number.isNaN(pollingElapsedMs) && pollingElapsedMs > 0 && (
            <span className="w3a-email-recovery-elapsed">
              (~{Math.round(pollingElapsedMs / 1000)}s)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailRecoverySlide;
