import React from 'react';

import type { EmailRecoverySSEEvent } from '@/core/types/sdkSentEvents';
import type { TatchiPasskey } from '@/core/TatchiPasskey';

export interface EmailRecoverySlideProps {
  tatchiPasskey: TatchiPasskey;
  accountId: string;
}

type EmailRecoveryPolicy = {
  minRequiredEmails?: number;
  maxAgeMs?: number;
};

type EmailRecoveryAccountInfo = {
  emailsCount: number;
};

export const EmailRecoverySlide: React.FC<EmailRecoverySlideProps> = ({ tatchiPasskey, accountId }) => {
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    setStatusText(null);
    setPollingElapsedMs(null);
    setErrorText(null);
    setAccountInfo(null);
    setAccountInfoError(null);
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

  const onEvent = React.useCallback(
    (ev: EmailRecoverySSEEvent) => {
      safeSetStatusText(ev?.message || null);

      const data = (ev as any)?.data || {};
      const elapsedRaw = data?.elapsedMs ?? data?.elapsed_ms;
      const elapsed = elapsedRaw == null ? Number.NaN : Number(elapsedRaw);
      if (!Number.isNaN(elapsed)) safeSetPollingElapsedMs(elapsed);

      if (ev?.phase === 'email-recovery-error' || (ev as any)?.status === 'error') {
        const raw = (ev as any)?.error || ev?.message || 'Email recovery failed';
        safeSetErrorText(String(raw));
      }
    },
    [safeSetStatusText, safeSetPollingElapsedMs, safeSetErrorText],
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
      return;
    }

    let cancelled = false;
    // Show loading state immediately (don't wait for debounce).
    safeSetAccountInfoLoading(true);
    safeSetAccountInfoError(null);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
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
  }, [accountIdInput, fetchAccountInfo, safeSetAccountInfo, safeSetAccountInfoError, safeSetAccountInfoLoading]);

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

    try {
      const result = await tatchiPasskey.startEmailRecovery({
        accountId: normalizedAccountId,
        recoveryEmail: emailCandidate,
        options: {
          onEvent,
          onError: (err: Error) => {
            safeSetErrorText(err?.message || 'Failed to start email recovery');
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

      await tatchiPasskey.finalizeEmailRecovery({
        accountId: normalizedAccountId,
        nearPublicKey: result.nearPublicKey,
        options: {
          onEvent,
          onError: (err: Error) => {
            safeSetErrorText(err?.message || 'Failed to finalize email recovery');
          },
          afterCall: async () => {},
        } as any,
      });

      safeSetStatusText('Email recovery completed on this device.');
      safeSetPendingMailtoUrl(null);
      safeSetPollingElapsedMs(null);
    } catch (err: any) {
      safeSetErrorText(err?.message || 'Failed to start email recovery');
    } finally {
      safeSetIsBusy(false);
    }
  }, [
    accountIdInput,
    recoveryEmailInput,
    onEvent,
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

  return (
    <div className="w3a-email-recovery-slide">
      <div className="w3a-email-recovery-title">Recover Account with Email</div>
      <div className="w3a-email-recovery-help">
        Send a special recovery email from your registered recovery email address,
        Your account will b recovered with a new key once the email is verified onchain.
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
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              disabled={isBusy}
            />
          </div>
        </div>
      </div>

      <div className="w3a-email-recovery-actions">
        <button
          onClick={handleStart}
          className="w3a-link-device-btn w3a-link-device-btn-primary"
          disabled={isBusy}
        >
          {isBusy ? 'Working…' : 'Start Email Recovery'}
        </button>
      </div>

      {pendingMailtoUrl && (
        <a className="w3a-email-recovery-link" href={pendingMailtoUrl}>
          Open recovery email draft
        </a>
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
