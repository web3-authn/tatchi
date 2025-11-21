import React from 'react'
import { ChevronRight } from 'lucide-react'

type CarouselButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export function CarouselNextButton({ children, className, ...buttonProps }: CarouselButtonProps) {
  const mergedClassName = className ? `carousel-next-btn ${className}` : 'carousel-next-btn'

  return (
    <button
      type="button"
      className={mergedClassName}
      {...buttonProps}
    >
      {children || 'Next'}
      <span className="btn-icon-right" aria-hidden>
        <ChevronRight size={16} />
      </span>
    </button>
  )
}

export default CarouselNextButton

