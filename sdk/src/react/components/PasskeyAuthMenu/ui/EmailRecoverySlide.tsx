import React from 'react';

import {
  EmailRecoveryPhase,
  EmailRecoveryStatus,
  type EmailRecoverySSEEvent,
} from '@/core/types/sdkSentEvents';
import type { TatchiPasskey } from '@/core/TatchiPasskey';
import { EmailRecoveryErrorCode } from '@/core/types/emailRecovery';
import type { EmailRecoveryFlowOptions } from '@/core/TatchiPasskey/emailRecovery';

export interface EmailRecoverySlideProps {
  tatchiPasskey: TatchiPasskey;
  accountId: string;
  refreshLoginState?: (nearAccountId?: string) => Promise<void>;
  emailRecoveryOptions?: {
    onEvent?: (event: EmailRecoverySSEEvent) => void;
    onError?: (error: Error) => void;
  };
}

type EmailRecoveryAccountInfo = {
  emailsCount: number;
};

type MailtoUiState = 'ready' | 'opening';

type RecoveryEmailRecord = Awaited<ReturnType<TatchiPasskey['getRecoveryEmails']>>[number];

function getEmailRecoveryErrorCode(err: unknown): EmailRecoveryErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return null;
  return Object.values(EmailRecoveryErrorCode).includes(code as EmailRecoveryErrorCode)
    ? (code as EmailRecoveryErrorCode)
    : null;
}

function getEmailRecoveryUiError(err: unknown): { message: string; canRestart: boolean } {
  const fallback = err instanceof Error ? err.message : String(err || '');
  const code = getEmailRecoveryErrorCode(err);
  switch (code) {
    case EmailRecoveryErrorCode.VRF_CHALLENGE_EXPIRED:
      return {
        message: fallback || 'Timed out finalizing registration (VRF challenge expired). Please restart email recovery and try again.',
        canRestart: true,
      };
    case EmailRecoveryErrorCode.REGISTRATION_NOT_VERIFIED:
      return {
        message: fallback || 'Registration did not verify on-chain. Please restart email recovery and try again.',
        canRestart: true,
      };
    default:
      return { message: fallback || 'Email recovery failed', canRestart: false };
  }
}

function getEmailRecoveryErrorTxHash(err: unknown): string | null {
  const carrier = (err as { context?: unknown; details?: unknown } | null);
  const ctx = carrier?.context && typeof carrier.context === 'object' ? carrier.context : null;
  const details = carrier?.details && typeof carrier.details === 'object' ? carrier.details : null;
  const source = ctx ?? details;
  if (!source) return null;
  const txHash = (source as { transactionHash?: unknown }).transactionHash;
  return typeof txHash === 'string' && txHash.trim().length > 0 ? txHash.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

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
  const [pendingMailtoUrl, setPendingMailtoUrl] = React.useState<string | null>(null);
  const [pendingNearPublicKey, setPendingNearPublicKey] = React.useState<string | null>(null);
  const [mailtoUiState, setMailtoUiState] = React.useState<MailtoUiState>('ready');
  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [pollingElapsedMs, setPollingElapsedMs] = React.useState<number | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [canRestart, setCanRestart] = React.useState(false);
  const [accountInfo, setAccountInfo] = React.useState<EmailRecoveryAccountInfo | null>(null);
  const [accountInfoLoading, setAccountInfoLoading] = React.useState(false);
  const [accountInfoError, setAccountInfoError] = React.useState<string | null>(null);
  const [localRecoveryEmails, setLocalRecoveryEmails] = React.useState<string[]>([]);
  const [explorerToast, setExplorerToast] = React.useState<{ url: string; accountId?: string; transactionHash?: string } | null>(null);

  const lastPrefilledAccountIdRef = React.useRef<string>('');

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
    setPendingNearPublicKey(null);
    setMailtoUiState('ready');
    cancelRequestedRef.current = false;
    setStatusText(null);
    setPollingElapsedMs(null);
    setErrorText(null);
    setCanRestart(false);
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
  const safeSetPendingNearPublicKey = React.useMemo(() => safeSet(setPendingNearPublicKey), []);
  const safeSetStatusText = React.useMemo(() => safeSet(setStatusText), []);
  const safeSetPollingElapsedMs = React.useMemo(() => safeSet(setPollingElapsedMs), []);
  const safeSetErrorText = React.useMemo(() => safeSet(setErrorText), []);
  const safeSetIsBusy = React.useMemo(() => safeSet(setIsBusy), []);
  const safeSetCanRestart = React.useMemo(() => safeSet(setCanRestart), []);
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

      const data = 'data' in ev ? asRecord(ev.data) : null;
      const rawTxHash = data?.['transactionHash'] ?? data?.['transaction_hash'];
      const txHash = typeof rawTxHash === 'string' ? rawTxHash.trim() : '';
      if (txHash) {
        const base = String(tatchiPasskey.configs?.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
        const url = base.includes('nearblocks.io')
          ? `${base}/txns/${txHash}`
          : `${base}/transactions/${txHash}`;
        safeSetExplorerToast({ url, transactionHash: txHash });
      }
      const elapsedRaw = data?.['elapsedMs'] ?? data?.['elapsed_ms'];
      if (elapsedRaw == null) safeSetPollingElapsedMs(null);
      const elapsed = elapsedRaw == null ? Number.NaN : Number(elapsedRaw);
      if (!Number.isNaN(elapsed)) safeSetPollingElapsedMs(elapsed);

      if (ev.phase === EmailRecoveryPhase.ERROR || ev.status === EmailRecoveryStatus.ERROR) {
        const raw = 'error' in ev ? ev.error : ev.message;
        safeSetErrorText(raw || 'Email recovery failed');
        safeSetCanRestart(false);
      }
    },
    [emailRecoveryOptions, safeSetCanRestart, safeSetErrorText, safeSetExplorerToast, safeSetPollingElapsedMs, safeSetStatusText, tatchiPasskey],
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

  const showExplorerTxToast = React.useCallback(
    (txHash: string) => {
      const normalized = (txHash || '').trim();
      if (!normalized) return;
      const base = String(tatchiPasskey.configs?.nearExplorerUrl || 'https://testnet.nearblocks.io').replace(/\/$/, '');
      const url = base.includes('nearblocks.io')
        ? `${base}/txns/${normalized}`
        : `${base}/transactions/${normalized}`;
      safeSetExplorerToast({ url, transactionHash: normalized });
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

  const deriveEmailsFromRecoveryRecords = React.useCallback((records: RecoveryEmailRecord[]): string[] => {
    if (records.length === 0) return [];
    const emails = records
      .map((r) => r.email.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes('@'));
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
          const records = await tatchiPasskey.getRecoveryEmails(normalized);
          const resolvedEmails = deriveEmailsFromRecoveryRecords(records);

          if (!cancelled) {
            safeSetLocalRecoveryEmails(resolvedEmails);
          }

          const info: EmailRecoveryAccountInfo | null = records
            ? { emailsCount: Array.isArray(records) ? records.length : 0 }
            : null;
          if (cancelled) return;
          safeSetAccountInfo(info);
        } catch (err: unknown) {
          if (cancelled) return;
          safeSetAccountInfo(null);
          const msg = err instanceof Error ? err.message : '';
          safeSetAccountInfoError(msg || 'Failed to load email recovery settings for this account');
          safeSetLocalRecoveryEmails([]);
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

    safeSetIsBusy(true);
    cancelRequestedRef.current = false;
    safeSetErrorText(null);
    safeSetCanRestart(false);
    safeSetStatusText(null);
    safeSetPollingElapsedMs(null);
    safeSetPendingMailtoUrl(null);
    safeSetPendingNearPublicKey(null);
    safeSetMailtoUiState('ready');

    let didForwardError = false;
    try {
      const result = await tatchiPasskey.startEmailRecovery({
        accountId: normalizedAccountId,
        options: {
          onEvent,
          onError: (err: Error) => {
            if (cancelRequestedRef.current) return;
            safeSetErrorText(err?.message || 'Failed to start email recovery');
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
        } satisfies EmailRecoveryFlowOptions,
      });

      safeSetPendingMailtoUrl(result.mailtoUrl);
      safeSetPendingNearPublicKey(result.nearPublicKey);
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
            const uiError = getEmailRecoveryUiError(err);
            safeSetErrorText(uiError.message || 'Failed to finalize email recovery');
            safeSetCanRestart(uiError.canRestart);
            const txHash = getEmailRecoveryErrorTxHash(err);
            if (txHash) showExplorerTxToast(txHash);
            didForwardError = true;
            emailRecoveryOptions?.onError?.(err);
          },
        } satisfies EmailRecoveryFlowOptions,
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
    } catch (err: unknown) {
      if (cancelRequestedRef.current) {
        safeSetErrorText('Email recovery cancelled. Please try again.');
        safeSetStatusText(null);
        safeSetPollingElapsedMs(null);
        safeSetPendingMailtoUrl(null);
        safeSetPendingNearPublicKey(null);
        safeSetMailtoUiState('ready');
        safeSetCanRestart(false);
        return;
      }
      const uiError = getEmailRecoveryUiError(err);
      safeSetErrorText(uiError.message || 'Failed to start email recovery');
      safeSetCanRestart(uiError.canRestart);
      const txHash = getEmailRecoveryErrorTxHash(err);
      if (txHash) showExplorerTxToast(txHash);
      if (!didForwardError && err instanceof Error) {
        emailRecoveryOptions?.onError?.(err);
      }
    } finally {
      safeSetIsBusy(false);
    }
  }, [
    accountIdInput,
    emailRecoveryOptions,
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
    showExplorerTxToast,
    tatchiPasskey,
  ]);

  const handleRestart = React.useCallback(async () => {
    const normalizedAccountId = (accountIdInput || '').trim();
    if (!normalizedAccountId) return;

    safeSetIsBusy(true);
    try {
      cancelRequestedRef.current = true;
      await tatchiPasskey.cancelEmailRecovery({
        accountId: normalizedAccountId,
        nearPublicKey: pendingNearPublicKey || undefined,
      }).catch(() => {});
      safeSetErrorText(null);
      safeSetStatusText(null);
      safeSetPollingElapsedMs(null);
      safeSetPendingMailtoUrl(null);
      safeSetPendingNearPublicKey(null);
      safeSetMailtoUiState('ready');
      safeSetCanRestart(false);
    } finally {
      cancelRequestedRef.current = false;
      safeSetIsBusy(false);
    }
  }, [
    accountIdInput,
    pendingNearPublicKey,
    safeSetCanRestart,
    safeSetErrorText,
    safeSetIsBusy,
    safeSetMailtoUiState,
    safeSetPendingMailtoUrl,
    safeSetPendingNearPublicKey,
    safeSetPollingElapsedMs,
    safeSetStatusText,
    tatchiPasskey,
  ]);

  const summaryLine: React.ReactNode = accountInfoLoading
    ? (
      <>
        Checking if account has recovery emails configured
        <span className="w3a-ellipsis" aria-hidden="true">
          <span className="w3a-ellipsis-dot">.</span>
          <span className="w3a-ellipsis-dot">.</span>
          <span className="w3a-ellipsis-dot">.</span>
        </span>
      </>
    )
    : accountInfo && !accountInfoError
      ? `Recovery emails configured: ${accountInfo.emailsCount}`
      : '\u00A0';

  const noRecoveryEmailsConfigured =
    !accountInfoLoading && !accountInfoError && !!accountInfo && accountInfo.emailsCount === 0;

  return (
    <div className="w3a-email-recovery-slide">
      <div className="w3a-email-recovery-title">Recover Account with Email</div>
      <div className="w3a-email-recovery-help">
        Send a special email to recover your account.
        This email must be sent from the designated email recovery address.
      </div>

      <div>
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
        {localRecoveryEmails.length > 0 && (
          <div className="w3a-email-recovery-saved-emails" role="list" aria-label="Recovery emails">
            {localRecoveryEmails.map((email) => (
              <span key={email} className="w3a-email-recovery-email-chip w3a-email-recovery-email-chip-static" role="listitem">
                {email}
              </span>
            ))}
          </div>
        )}
        {!!accountIdInput.trim() && !noRecoveryEmailsConfigured && (
          <div className="w3a-email-recovery-from-warning">
            Check that you are sending the recovery email from your designated recovery email.
          </div>
        )}
      </div>

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

        {errorText && canRestart && (
          <button
            type="button"
            onClick={handleRestart}
            className="w3a-link-device-btn"
            disabled={isBusy}
          >
            Restart email recovery
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
              <br/>
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
