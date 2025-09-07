import React from 'react';
import { ArrowRight } from 'lucide-react';
import TouchIcon from '../ProfileSettingsButton/TouchIcon';
import { usePostfixPosition } from './usePostfixPosition';
import { AccountExistsBadge } from './AccountExistsBadge';
import { AuthMenuMode } from './index';

export interface PasskeyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  postfixText?: string;
  isUsingExistingAccount?: boolean;
  canProceed: boolean;
  onProceed: () => void;
  /** Controls which proceed controls render */
  variant?: 'arrow' | 'label' | 'both';
  /** Text for the primary labeled button (e.g., Login/Register) */
  primaryLabel?: string;
  /** Current signup mode for status badge */
  mode?: AuthMenuMode;
  /** Whether the current context is secure (HTTPS) */
  secure?: boolean;
}

export const PasskeyInput: React.FC<PasskeyInputProps> = ({
  value,
  onChange,
  placeholder,
  postfixText,
  isUsingExistingAccount,
  canProceed,
  onProceed,
  variant = 'arrow',
  primaryLabel,
  mode,
  secure,
}) => {
  const { bindInput, bindPostfix } = usePostfixPosition({ inputValue: value });

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onProceed();
  };

  return (
    <div className="w3a-passkey-row">
      <div className="w3a-input-pill">
        <TouchIcon
          width={24}
          height={24}
          strokeWidth={1.5}
          style={{ color: 'var(--w3a-colors-textPrimary)' }}
        />
        <div className="w3a-input-wrap">
          <input
            ref={bindInput}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onEnter}
            placeholder={placeholder}
            className="w3a-input"
          />
          {postfixText && value.length > 0 && (
            <span
              ref={bindPostfix}
              title={isUsingExistingAccount ? 'Using existing account domain' : 'New account domain'}
              className={`w3a-postfix${isUsingExistingAccount ? ' is-existing' : ''}`}
            >
              {postfixText}
            </span>
          )}
          {mode && typeof secure === 'boolean' && (
            <AccountExistsBadge
              isUsingExistingAccount={isUsingExistingAccount}
              mode={mode}
              secure={secure}
            />
          )}
        </div>
      </div>
      {(variant === 'arrow' || variant === 'both') && (
        <button
          aria-label="Continue"
          onClick={onProceed}
          className="w3a-arrow-btn"
          disabled={!canProceed}
        >
          <ArrowRight size={20} strokeWidth={2.5} color="#ffffff" style={{ display: 'block' }} />
        </button>
      )}
    </div>
  );
};

export default PasskeyInput;
