import React from 'react';

interface LoadingButtonProps {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  className?: string;
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
  type = 'button',
}) => {
  const isDisabled = disabled || loading;

  const baseClasses = 'button';
  const variantClasses = {
    primary: 'button--primary',
    secondary: 'button--secondary',
    danger: 'button--danger',
  };
  const sizeClasses = {
    small: 'button--small',
    medium: 'button--medium',
    large: 'button--large',
  };
  const loadingClasses = loading ? 'button--loading' : '';

  const buttonClasses = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    loadingClasses,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const displayText = loading && loadingText ? loadingText : children;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={buttonClasses}
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
            strokeDasharray="31.416"
            strokeDashoffset="31.416"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 12 12;360 12 12"
              dur="1s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="stroke-dashoffset"
              values="31.416;0"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      )}
      <span className="button__text">{displayText}</span>
    </button>
  );
};
