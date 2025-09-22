import React from 'react';
// Arrow visuals handled inside ArrowButton
// Refactored: React-driven postfix positioning (no imperative DOM writes)
import { AuthMenuMode } from './index';
import { AccountExistsBadge } from './AccountExistsBadge';
import { usePasskeyContext } from '../../context';
import ArrowButton from './ArrowButton';

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
  const ctx = (() => {
    try {
      return usePasskeyContext();
    } catch {
      return undefined;
    }
  })();

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const measurerRef = React.useRef<HTMLSpanElement | null>(null);
  // caretIndex retained initially but not used for measuring anymore
  const [caretIndex, setCaretIndex] = React.useState<number>(value.length);
  const [postfixLeft, setPostfixLeft] = React.useState<number>(0);
  const [measured, setMeasured] = React.useState<boolean>(false);
  const [padAndBorderLeft, setPadAndBorderLeft] = React.useState<number>(0);
  const statusId = React.useId();

  // Read static paddings from computed style once
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const cs = window.getComputedStyle(input);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    setPadAndBorderLeft(pl + bl);
  }, []);

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onProceed();
  };

  const updateCaret = () => {
    const el = inputRef.current;
    if (!el) return;
    const ci = el.selectionStart ?? el.value.length;
    setCaretIndex(ci);
  };

  // Measure width of full username via hidden measurer
  React.useLayoutEffect(() => {
    const measurer = measurerRef.current;
    const input = inputRef.current;
    if (!measurer || !input) return;
    const cs = window.getComputedStyle(input);
    let text = value;
    switch (cs.textTransform) {
      case 'uppercase': text = text.toUpperCase(); break;
      case 'lowercase': text = text.toLowerCase(); break;
      case 'capitalize': text = text.replace(/\b(\p{L})/gu, (m) => m.toUpperCase()); break;
    }
    measurer.textContent = text;
    const w = measurer.offsetWidth || 0;
    setPostfixLeft(padAndBorderLeft + w + 1);
    setMeasured(true);
  }, [value, padAndBorderLeft]);

  // Re-measure after fonts are ready just in case
  React.useEffect(() => {
    const measurer = measurerRef.current;
    const input = inputRef.current;
    // @ts-ignore fonts API optional
    const fonts = (document as any)?.fonts;
    if (measurer && input && fonts && fonts.ready) {
      fonts.ready.then(() => {
        // trigger layout effect by forcing state update
        setPadAndBorderLeft((x) => x);
      }).catch(() => {});
    }
  }, []);

  return (
    <div className="w3a-passkey-row">
      <div className={`w3a-input-pill${canProceed ? ' is-enabled' : ''}`}>
        <div className="w3a-input-wrap">
          {/* Hidden measurer to compute width up to caret; mirrors input font */}
          <span ref={measurerRef} aria-hidden className="w3a-measurer" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { onChange(e.target.value); }}
            onKeyDown={onEnter}
            onKeyUp={updateCaret}
            onClick={updateCaret}
            onSelect={updateCaret}
            placeholder={placeholder}
            className="w3a-input"
            aria-describedby={statusId}
          />
          {postfixText && value.length > 0 && (
            <span
              title={isUsingExistingAccount ? 'Using existing account domain' : 'New account domain'}
              className={`w3a-postfix${isUsingExistingAccount ? ' is-existing' : ''}`}
              style={{
                left: `${postfixLeft}px`,
                visibility: measured ? 'visible' : 'hidden'
              }}
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

      <ArrowButton onClick={onProceed} disabled={!canProceed} />

      {/* {
        mode === 'login' || mode === 'recover'
        ? <ArrowButton onClick={onProceed} disabled={!canProceed} />
        : (
          <ArrowButton
            disabled={!canProceed}
            embeddedRegister={false}
            nearAccountId={ctx?.accountInputState.targetAccountId || ''}
            width={100}
            height={64}
            onRegisterSuccess={() => {}}
            onRegisterError={(e) => { console.error('[PasskeyInput] Register error:', e); }}
          />
        )
      } */}
    </div>
  );
};

// ArrowButton moved to its own module

export default PasskeyInput;
