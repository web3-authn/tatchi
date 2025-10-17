import React from 'react'

export type TerminalProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string
}

export const Terminal: React.FC<TerminalProps> = ({ className, size = 24, width, height, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width ?? size}
    height={height ?? size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={["lucide", "lucide-terminal-icon", "lucide-terminal", className].filter(Boolean).join(' ')}
    aria-hidden="true"
    {...props}
  >
    <path d="M12 19h8" />
    <path d="m4 17 6-6-6-6" />
  </svg>
)

export default Terminal
