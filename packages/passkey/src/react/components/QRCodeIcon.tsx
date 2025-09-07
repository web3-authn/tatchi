import React from 'react';

export interface QRCodeIconProps {
  className?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

/**
 * QRCodeIcon — React wrapper for the lucide QR Code SVG.
 * Uses currentColor for stroke so it inherits color from context.
 */
const QRCodeIcon: React.FC<QRCodeIconProps> = ({
  className,
  width = 24,
  height = 24,
  strokeWidth = 2,
  style,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`lucide lucide-qr-code-icon lucide-qr-code${className ? ` ${className}` : ''}`}
    style={style}
  >
    <rect width="5" height="5" x="3" y="3" rx="1" />
    <rect width="5" height="5" x="16" y="3" rx="1" />
    <rect width="5" height="5" x="3" y="16" rx="1" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
    <path d="M21 21v.01" />
    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
    <path d="M3 12h.01" />
    <path d="M12 3h.01" />
    <path d="M12 16v.01" />
    <path d="M16 12h1" />
    <path d="M21 12v.01" />
    <path d="M12 21v-1" />
  </svg>
);

export default QRCodeIcon;

