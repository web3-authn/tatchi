/**
 * mobilePressHandlers: reduce perceived press delay on mobile by
 * invoking the action on pointerdown for touch/pen, while retaining
 * click activation for mouse/keyboard. De‑dupes the follow‑up click.
 *
 * Not a React hook — safe to create inline in maps.
 */
export function mobilePressHandlers(onActivate: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      const pt = (e as any).pointerType as string | undefined
      if (pt && pt !== 'mouse') {
        e.preventDefault()
        ;(e.currentTarget as any)._w3aSkipNextClick = true
        onActivate()
      }
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const tgt = e.currentTarget as any
      if (tgt._w3aSkipNextClick) {
        tgt._w3aSkipNextClick = false
        return
      }
      onActivate()
    },
  }
}
import type React from 'react'
