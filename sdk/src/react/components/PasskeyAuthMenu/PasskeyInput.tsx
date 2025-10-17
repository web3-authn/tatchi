import React from 'react';
import { AuthMenuMode, AuthMenuModeMap } from './index';
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
  const { bindInput, bindPostfix } = usePostfixPosition({ inputValue: value, gap: 1 });
  const isRegisterMode = mode === AuthMenuMode.Register || (typeof mode === 'number' && (AuthMenuModeMap as any)[mode] === 'register');
  const inputEnabled = canProceed && !waiting;

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onProceed();
  };

  return (
    <div className="w3a-passkey-row">
      <div className={`w3a-input-pill${inputEnabled ? ' is-enabled' : ''}`}>
        <div className="w3a-input-wrap">
          <input
            ref={bindInput}
            type="text"
            value={value}
            onChange={(e) => { onChange(e.target.value); }}
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

      <ArrowButton
        disabled={!canProceed || !!waiting}
        onClick={onProceed}
      />

    </div>
  );
};

export default PasskeyInput;
