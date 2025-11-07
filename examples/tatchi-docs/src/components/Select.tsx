import * as React from 'react'
import * as RadixSelect from '@radix-ui/react-select'
import clsx from 'clsx'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import './Select.css'

// Root
export const Select: React.FC<RadixSelect.SelectProps> = (props) => (
  <RadixSelect.Root {...props} />
)

// Trigger + Value + Icon
export const SelectTrigger = React.forwardRef<HTMLButtonElement, RadixSelect.SelectTriggerProps>(
  ({ className, children, ...rest }, ref) => (
    <RadixSelect.Trigger ref={ref} className={clsx('select-trigger', className)} {...rest}>
      {children}
    </RadixSelect.Trigger>
  )
)
SelectTrigger.displayName = 'SelectTrigger'

export const SelectValue = RadixSelect.Value

// Content + Viewport + Scroll buttons
export const SelectContent = React.forwardRef<HTMLDivElement, RadixSelect.SelectContentProps>(
  ({ className, children, side, position, sideOffset, ...rest }, ref) => (
    <RadixSelect.Content
      ref={ref}
      className={clsx('select-content', className)}
      // Ensure dropdown appears below the trigger by default
      position={position ?? 'popper'}
      side={side ?? 'bottom'}
      sideOffset={sideOffset ?? 6}
      {...rest}
    >
      <RadixSelect.Viewport className="select-viewport">
        {children}
      </RadixSelect.Viewport>
    </RadixSelect.Content>
  )
)
SelectContent.displayName = 'SelectContent'

// Item with check indicator
export const SelectItem = React.forwardRef<
  HTMLDivElement,
  RadixSelect.SelectItemProps & { className?: string }
>(({ children, className, ...props }, ref) => (
  <RadixSelect.Item ref={ref} className={clsx('select-item', className)} {...props}>
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    <RadixSelect.ItemIndicator className="select-item-indicator">
      <Check size={16} />
    </RadixSelect.ItemIndicator>
  </RadixSelect.Item>
))
SelectItem.displayName = 'SelectItem'

// Simple re-exports for group/label/separator
export const SelectGroup = RadixSelect.Group
export const SelectLabel = React.forwardRef<HTMLDivElement, RadixSelect.SelectLabelProps>(
  ({ className, ...props }, ref) => (
    <RadixSelect.Label ref={ref} className={clsx('select-label', className)} {...props} />
  )
)
SelectLabel.displayName = 'SelectLabel'

export const SelectSeparator = React.forwardRef<HTMLDivElement, RadixSelect.SelectSeparatorProps>(
  ({ className, ...props }, ref) => (
    <RadixSelect.Separator ref={ref} className={clsx('select-separator', className)} {...props} />
  )
)
SelectSeparator.displayName = 'SelectSeparator'
