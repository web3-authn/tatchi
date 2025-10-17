import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy as CopyIcon, Check as CheckIcon } from 'lucide-react'

export type CopyButtonProps = {
  text: string
  ariaLabel?: string
  className?: string
  size?: number
  onCopy?: () => void
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  ariaLabel = 'Copy to clipboard',
  className,
  size = 16,
  onCopy,
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  const buttonClass = useMemo(
    () => ['install-copy', isCopied ? 'is-copied' : '', className].filter(Boolean).join(' '),
    [isCopied, className]
  )

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => clearTimer(), [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(text)
      setIsCopied(true)
      onCopy?.()
      clearTimer()
      timerRef.current = window.setTimeout(() => setIsCopied(false), 1200)
    } catch {
      // ignore
    }
  }, [text, onCopy])

  return (
    <button type="button" className={buttonClass} onClick={handleCopy} aria-label={ariaLabel}>
      <span
        className="install-copy-inner"
        style={{ ['--install-copy-icon-size' as any]: `${size}px` }}
        aria-hidden
      >
        <span className="install-copy-check">
          <CheckIcon width={size} height={size} />
        </span>
        <span className="install-copy-copy-icon">
          <CopyIcon width={size} height={size} />
        </span>
      </span>
    </button>
  )
}

export default CopyButton

