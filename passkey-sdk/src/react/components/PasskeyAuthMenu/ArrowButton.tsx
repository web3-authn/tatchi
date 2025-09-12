import React from 'react';
import { ArrowUpIcon } from './icons';

export interface ArrowButtonProps {
  disabled: boolean;
  onClick?: () => void;
  /** Optional explicit dimensions */
  width?: number | string;
  height?: number | string;
}

export const ArrowButton: React.FC<ArrowButtonProps> = ({
  onClick,
  disabled,
  width,
  height,
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
    <div style={{ position: 'relative', display: 'inline-block', width: w, height: h }}>
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
