import React from 'react';

interface AtSignIconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const AtSignIcon: React.FC<AtSignIconProps> = ({
  size = 24,
  className = '',
  color = 'currentColor'
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide lucide-at-sign-icon lucide-at-sign ${className}`}
    >
      <circle cx="12" cy="12" r="4"/>
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>
    </svg>
  );
};

export default AtSignIcon;