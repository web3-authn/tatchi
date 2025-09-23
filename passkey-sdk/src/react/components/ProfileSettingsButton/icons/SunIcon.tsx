import React from 'react';

export type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  animate?: boolean;
};

export const SunIcon: React.FC<IconProps> = ({
  size = 24,
  className,
  strokeWidth = 2,
  animate = true,
  style,
  ...rest
}) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  const animationDuration = '900ms';
  const fromColor = '#FACC15';
  const dash = 100;
  const dashProps = animate
    ? {
        pathLength: dash,
        strokeDasharray: dash,
        strokeDashoffset: mounted ? 0 : dash,
        style: {
          stroke: mounted ? 'currentColor' : fromColor,
          transition: `stroke-dashoffset ${animationDuration} cubic-bezier(0.22, 1, 0.36, 1), stroke ${animationDuration} ease`,
          ...style,
        } as React.CSSProperties,
      }
    : { style };

  return (
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
      className={`lucide lucide-sun-icon lucide-sun${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="12" cy="12" r="4" {...(dashProps as any)} />
      <path d="M12 2v2" {...(dashProps as any)} />
      <path d="M12 20v2" {...(dashProps as any)} />
      <path d="m4.93 4.93 1.41 1.41" {...(dashProps as any)} />
      <path d="m17.66 17.66 1.41 1.41" {...(dashProps as any)} />
      <path d="M2 12h2" {...(dashProps as any)} />
      <path d="M20 12h2" {...(dashProps as any)} />
      <path d="m6.34 17.66-1.41 1.41" {...(dashProps as any)} />
      <path d="m19.07 4.93-1.41 1.41" {...(dashProps as any)} />
    </svg>
  );
};

export default SunIcon;
