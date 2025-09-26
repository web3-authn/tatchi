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
  /** Optional: make this div an anchor for the Lit Arrow overlay */
  arrowAnchorRef?: React.Ref<HTMLDivElement>;
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
  const toCssSize = (v?: number | string): string | undefined => {
    if (v == null) return undefined;
    if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
    const s = String(v).trim();
    return s || undefined;
  };
  const w = toCssSize(width);
  const h = toCssSize(height);
  return (
    <div
      ref={arrowAnchorRef}
      onPointerEnter={mountArrowAtRect}
      onFocus={mountArrowAtRect}
      style={{ position: 'relative', display: 'inline-block', width: w, height: h }}
    >
      <button
        aria-label="Continue"
        onClick={onClick}
        className={`w3a-arrow-btn${!disabled ? ' is-enabled' : ''}`}
        disabled={disabled}
        style={{ width: w, height: h }}
      >
        {!disabled && (
          <ArrowUpIcon
            size={24}
            strokeWidth={2.5}
            color="#ffffff"
            style={{ display: 'block', transition: 'transform 200ms, width 200ms, height 200ms' }}
          />
        )}
      </button>
    </div>
  );
};

export default ArrowButton;
