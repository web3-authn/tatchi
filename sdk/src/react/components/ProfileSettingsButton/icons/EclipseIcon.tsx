import React from 'react';

export type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
};

export const EclipseIcon: React.FC<IconProps> = ({
  size = 24,
  strokeWidth = 2,
  className,
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
    className={`lucide lucide-sun-moon-icon lucide-sun-moon${className ? ` ${className}` : ''}`}
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    <path d="M12 2v2" />
    <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" />
    <path d="M16 12a4 4 0 0 0-4-4" />
    <path d="m19 5-1.256 1.256" />
    <path d="M20 12h2" />
  </svg>
);

export default EclipseIcon;
