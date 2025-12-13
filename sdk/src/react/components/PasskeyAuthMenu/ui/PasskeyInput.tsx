import React from 'react';
import { AuthMenuMode, AuthMenuModeMap } from '../authMenuTypes';
import { AccountExistsBadge } from './AccountExistsBadge';
import ArrowButton from './ArrowButton';
import { usePostfixPosition } from './usePostfixPosition';

export interface PasskeyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  postfixText?: string;
  isUsingExistingAccount?: boolean;
  canProceed: boolean;
  onProceed: () => void;
  /** Current signup mode for status badge */
  mode?: AuthMenuMode;
  /** Whether the current context is secure (HTTPS) */
  secure?: boolean;
  /** Whether the parent flow is waiting on passkey resolution */
  waiting?: boolean;
}

export const PasskeyInput: React.FC<PasskeyInputProps> = ({
  value,
  onChange,
  placeholder,
  postfixText,
  isUsingExistingAccount,
  canProceed,
  onProceed,
  mode,
  secure,
  waiting = false,
}: PasskeyInputProps) => {
  const statusId = React.useId();
  const inputId = React.useId();
  const { bindInput, bindPostfix } = usePostfixPosition({ inputValue: value, gap: 1 });
  const inputEnabled = canProceed && !waiting;

  // Keep a stable ref to the input so we can manage focus across transitions
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const prevWaitingRef = React.useRef<boolean>(waiting);

  const attachInputRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      bindInput(el);
      inputRef.current = el;
    },
    [bindInput],
  );

  // Autofocus on initial mount when the input appears
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.focus();
      const len = el.value?.length ?? 0;
      if (len >= 0 && typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(len, len);
      }
    } catch {
      // best-effort focus; ignore failures
    }
  }, []);

  // When returning from a waiting state (e.g., login/register attempt cancelled),
  // re-focus the input so users can keep typing without an extra click.
  React.useEffect(() => {
    const prev = prevWaitingRef.current;
    if (prev && !waiting && inputRef.current) {
      try {
        inputRef.current.focus();
        const len = inputRef.current.value?.length ?? 0;
        if (len >= 0 && typeof inputRef.current.setSelectionRange === 'function') {
          inputRef.current.setSelectionRange(len, len);
        }
      } catch {
        // ignore focus errors
      }
    }
    prevWaitingRef.current = waiting;
  }, [waiting]);

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onProceed();
  };

  return (
    <div className="w3a-passkey-row">
      <div className={`w3a-input-pill${inputEnabled ? ' is-enabled' : ''}`}>
        <div className="w3a-input-wrap">
          <input
            ref={attachInputRef}
            type="text"
            id={inputId}
            name="passkey"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            onKeyDown={onEnter}
            placeholder={placeholder}
            className="w3a-input"
            aria-describedby={statusId}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
          />
          {postfixText && value.length > 0 && (
            <span
              title={isUsingExistingAccount ? 'Using existing account domain' : 'New account domain'}
              className={`w3a-postfix${isUsingExistingAccount ? ' is-existing' : ''}`}
              ref={bindPostfix}
            >
              {postfixText}
            </span>
          )}
          <AccountExistsBadge
            id={statusId}
            isUsingExistingAccount={isUsingExistingAccount}
            mode={mode}
            secure={secure}
          />
        </div>
      </div>

      <ArrowButton disabled={!canProceed || !!waiting} onClick={onProceed} />
    </div>
  );
};

export default PasskeyInput;
