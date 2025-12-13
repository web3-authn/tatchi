import React from 'react';

interface ArrowRightIconProps {
  size?: number;
  className?: string;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export const ArrowRightIcon: React.FC<ArrowRightIconProps> = ({
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
};

export default ArrowRightIcon;

