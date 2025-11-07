import React from 'react'

export function IPhoneQRScanner(props: {
  width?: number | string
  height?: number | string
  className?: string
  style?: React.CSSProperties
}) {
  const { width = 140, height, className, style } = props
  const vbW = 200
  const vbH = 400
  const bodyFill = 'var(--w3a-colors-surface2)'
  const border = 'none'
  const screenFill = 'var(--w3a-colors-surface1, rgba(0,0,0,0.04))'
  const details = 'var(--fe-text-secondary)'

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={width}
      height={height}
      className={className}
      style={style}
      aria-label="iPhone with QR scanner rectangle"
    >
      {/* Phone body */}
      <rect x={8} y={4} width={vbW-16} height={vbH-8} rx={36} fill={bodyFill} stroke={border} />
      {/* Notch */}
      <rect x={vbW/2 - 40} y={14} width={80} height={10} rx={5} fill={details} opacity={0.25} />
      {/* Screen */}
      <rect x={20} y={34} width={vbW-40} height={vbH-68} rx={28} fill={screenFill} />

      {/* QR scanning square (corner brackets), centered on screen */}
      {(() => {
        // Define a square scanner centered within the screen area
        const screenX = 20
        const screenY = 34
        const screenW = vbW - 40 // 160
        const screenH = vbH - 68 // 332
        const cx = screenX + screenW / 2
        const cy = screenY + screenH / 2
        const size = 120 // square size
        const half = size / 2
        const x1 = cx - half
        const y1 = cy - half
        const x2 = cx + half
        const y2 = cy + half
        const l = 34 // corner segment length
        return (
          <g stroke={details} strokeWidth={6} strokeLinecap="round">
            {/* Top-left */}
            <path d={`M ${x1} ${y1} L ${x1 + l} ${y1} M ${x1} ${y1} L ${x1} ${y1 + l}`} />
            {/* Top-right */}
            <path d={`M ${x2} ${y1} L ${x2 - l} ${y1} M ${x2} ${y1} L ${x2} ${y1 + l}`} />
            {/* Bottom-left */}
            <path d={`M ${x1} ${y2} L ${x1 + l} ${y2} M ${x1} ${y2} L ${x1} ${y2 - l}`} />
            {/* Bottom-right */}
            <path d={`M ${x2} ${y2} L ${x2 - l} ${y2} M ${x2} ${y2} L ${x2} ${y2 - l}`} />
          </g>
        )
      })()}

      {/* Subtle center guide */}
      <rect x={vbW/2 - 20} y={vbH/2 - 20} width={40} height={40} fill={details} opacity={0.08} />

      {/* Side buttons (decorative) */}
      <rect x={vbW-8} y={120} width={4} height={36} rx={2} fill={details} opacity={0.35} />
      <rect x={vbW-8} y={164} width={4} height={24} rx={2} fill={details} opacity={0.35} />
    </svg>
  )
}

export default IPhoneQRScanner
