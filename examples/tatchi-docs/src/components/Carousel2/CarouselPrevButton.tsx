import React from 'react'
import { ChevronLeft } from 'lucide-react'

type CarouselButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export function CarouselPrevButton({ children, className, ...buttonProps }: CarouselButtonProps) {
  const mergedClassName = className ? `carousel-next-btn ${className}` : 'carousel-next-btn'

  return (
    <button
      type="button"
      className={mergedClassName}
      {...buttonProps}
    >
      <span className="btn-icon-left" aria-hidden>
        <ChevronLeft size={16} />
      </span>
      {children || 'Previous'}
    </button>
  )
}

export default CarouselPrevButton

