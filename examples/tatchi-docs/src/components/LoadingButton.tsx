import React from 'react';
import './LoadingButton.css';

interface LoadingButtonProps {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  className?: string;
  style?: React.CSSProperties;
  textStyles?: React.CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  loadingText,
  children,
  variant = 'primary',
  size = 'medium',
  className = '',
  style,
  textStyles,
  type = 'button',
}) => {
  const isDisabled = disabled || loading;

  // Build classes directly without intermediate maps
  const buttonClasses = [
    'button',
    `button--${variant}`,
    `button--${size}`,
    loading ? 'button--loading' : '',
    className,
  ].filter(Boolean).join(' ');

  const displayText = loading && loadingText ? loadingText : children;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={buttonClasses}
      style={style}
      aria-disabled={isDisabled}
      aria-busy={loading}
    >
      {loading && (
        <svg
          className="button__spinner"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            /* Draw a shorter arc for a bigger visual gap */
            strokeDasharray="40 200"
            strokeDashoffset="0"
          />
        </svg>
      )}
      <span className="button__text" style={textStyles}>{displayText}</span>
    </button>
  );
};
