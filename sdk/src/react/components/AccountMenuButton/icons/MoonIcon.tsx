import React from 'react';

export type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  animate?: boolean;
};

export const MoonIcon: React.FC<IconProps> = ({
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
  const fromColor = '#7C3AED';
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
      className={`lucide lucide-moon-icon lucide-moon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
        {...(dashProps as any)}
      />
    </svg>
  );
};

export default MoonIcon;
