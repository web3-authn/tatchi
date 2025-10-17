import React from 'react';
import { ArrowUpIcon } from './icons';
import { usePasskeyContext } from '../../context';

export interface ArrowButtonProps {
  disabled: boolean;
  onClick?: () => void;
  /** Optional explicit dimensions */
  width?: number | string;
  height?: number | string;
  /** If true, attempts registerPasskey when the Lit overlay isn't active */
  fallbackRegister?: boolean;
  /** Optional: anchor ref for the Lit overlay (button element) */
  arrowAnchorRef?: React.Ref<HTMLButtonElement>;
  /** Optional: mount handler for Lit overlay on hover/focus */
  mountArrowAtRect?: () => void;
}

export const ArrowButton: React.FC<ArrowButtonProps> = ({
  onClick,
  disabled,
  width,
  height,
  fallbackRegister,
  arrowAnchorRef,
  mountArrowAtRect,
}) => {
  const prevDisabledRef = React.useRef<boolean | null>(null);
  const skipTransition = React.useMemo(() => {
    const prev = prevDisabledRef.current;
    prevDisabledRef.current = disabled;
    if (prev === null) return true; // initial render
    if (prev === disabled) return !disabled; // state unchanged
    if (prev === true && disabled === false) return false; // enabling -> allow animation
    return true; // all other cases
  }, [disabled]);

  const toCssSize = (v?: number | string): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
    const s = String(v).trim();
    return s || undefined;
  };
  const w = toCssSize(width);
  const h = toCssSize(height);
  const className = `w3a-arrow-btn${!disabled ? ' is-enabled' : ''}${skipTransition ? ' no-transition' : ''}`;
  return (
    <div
      onPointerEnter={mountArrowAtRect}
      onFocus={mountArrowAtRect}
      style={{ position: 'relative', display: 'inline-block', width: w, height: h }}
    >
      <button
        ref={arrowAnchorRef}
        aria-label="Continue"
        onPointerEnter={mountArrowAtRect}
        onClick={onClick}
        className={className}
        disabled={disabled}
        style={{ width: w, height: h }}
      >
        <ArrowUpIcon
          size={24}
          strokeWidth={2.5}
          color="#ffffff"
          style={{
            transition: 'transform 200ms, width 200ms, height 200ms',
            opacity: disabled ? 0 : 1,
          }}
        />
      </button>
    </div>
  );
};

export default ArrowButton;
