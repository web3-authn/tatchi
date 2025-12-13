import React from 'react';
import type { IconProps } from './SunIcon';

export const SlidersIcon: React.FC<IconProps> = ({
  size = 24,
  className,
  strokeWidth = 2,
  ...rest
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`lucide lucide-sliders-vertical-icon lucide-sliders-vertical${className ? ` ${className}` : ''}`}
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    <path d="M10 8h4" />
    <path d="M12 21v-9" />
    <path d="M12 8V3" />
    <path d="M17 16h4" />
    <path d="M19 12V3" />
    <path d="M19 21v-5" />
    <path d="M3 14h4" />
    <path d="M5 10V3" />
    <path d="M5 21v-7" />
  </svg>
);

export default SlidersIcon;
