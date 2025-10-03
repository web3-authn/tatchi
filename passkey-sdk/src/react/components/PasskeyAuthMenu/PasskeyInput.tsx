import React from 'react';
// Arrow visuals handled by the Lit wrapper component
// Refactored: React-driven postfix positioning (no imperative DOM writes)
import { AuthMenuMode, AuthMenuModeMap } from './index';
import { AccountExistsBadge } from './AccountExistsBadge';
import ArrowButton from './ArrowButton';
import { usePasskeyContext } from '../../context';
import { useArrowButtonOverlay } from './ArrowButtonOverlayHooks';
import { isIOS, isSafari, isMobileDevice } from '@/utils';
// We mount the arrow inside the wallet iframe using the UI registry.
// The local Lit wrapper is not used here.

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
  /** Whether the parent flow is waiting on passkey resolution */
  waiting?: boolean;
  /** Hide local arrow when wallet-iframe renders the register button */
  hideLocalArrow?: boolean;
  /**
   * When true (default=false), mount the register arrow inside the wallet iframe overlay
   * to capture activation in the wallet origin. When false, render a local
   * Lit-based arrow button (w3a-arrow-register-button) and dispatch onProceed
   * directly from the parent origin (requires an extra confirm click)
   */
  useIframeArrowButtonOverlay?: boolean;
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
  waiting = false,
  hideLocalArrow = false,
  useIframeArrowButtonOverlay = false,
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

  const isRegisterMode = mode === AuthMenuMode.Register || (typeof mode === 'number' && (AuthMenuModeMap as any)[mode] === 'register');
  const canShowArrow = isRegisterMode && canProceed && !waiting;
  const inputEnabled = canProceed && !waiting;

  const resolveNearAccountId = React.useCallback((): string | null => {
    // Prefer context-derived full account id
    const fromCtx = ctx?.accountInputState?.targetAccountId;
    if (typeof fromCtx === 'string' && fromCtx.trim().length > 0) return fromCtx.trim();
    // Fallback: derive from value + postfixText when available
    if (typeof value === 'string' && value.trim().length > 0 && typeof postfixText === 'string' && postfixText.length > 0) {
      return `${value.trim()}${postfixText}`;
    }
    return null;
  }, [ctx, value, postfixText]);

  const nearAccountId = resolveNearAccountId();
  const normalizedMode = (typeof mode === 'number' ? (AuthMenuModeMap as any)[mode] : mode) || 'register';

  // Anchored wallet-iframe arrow mounting via hook
  const overlayAllowed = React.useMemo(() => {
    try { return !(isIOS() || isSafari() || isMobileDevice()); } catch { return false; }
  }, []);

  const { arrowAnchorRef, mountArrowAtRect } = useArrowButtonOverlay({
    enabled: canShowArrow && useIframeArrowButtonOverlay && overlayAllowed,
    waiting,
    mode: normalizedMode,
    nearAccountId,
    id: 'w3a-auth-menu-arrow',
  });

  return (
    <div className="w3a-passkey-row">
      <div className={`w3a-input-pill${inputEnabled ? ' is-enabled' : ''}`}>
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

      {isRegisterMode ? (
        <ArrowButton
          disabled={!canProceed || !!waiting}
          onClick={(useIframeArrowButtonOverlay && overlayAllowed) ? mountArrowAtRect : onProceed}
          // iframe mode only
          arrowAnchorRef={(useIframeArrowButtonOverlay && overlayAllowed) ? arrowAnchorRef : undefined}
          mountArrowAtRect={(useIframeArrowButtonOverlay && overlayAllowed) ? mountArrowAtRect : undefined}
          fallbackRegister={!!(useIframeArrowButtonOverlay && overlayAllowed)}
        />
      ) : (
        // For Login and Recover: always show the React ArrowButton (original variant)
        <ArrowButton
          disabled={!canProceed || !!waiting}
          onClick={onProceed}
        />
      )}

    </div>
  );
};

export default PasskeyInput;
