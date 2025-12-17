import React from 'react';

interface MailIconProps {
  size?: number;
  className?: string;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export const MailIcon: React.FC<MailIconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor',
  strokeWidth = 2,
  style,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </svg>
  );
};

export default MailIcon;
