import { forwardRef, memo } from 'react';
import type { MenuItemProps } from './types';

export const MenuItem = memo(forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ item, onClose, className, style, isHighlighted = false }, ref) => {
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!item.disabled) {
        if (item.onClick) {
          item.onClick();
        }
        if (!item.keepOpenOnClick) {
          onClose();
        }
      }
    };

    const disabledClass = item.disabled ? ' disabled' : '';
    const highlightedClass = isHighlighted ? ' highlighted' : '';
    const classNameProps = className ? ` ${className}` : '';

    return (
      <button
        ref={ref}
        disabled={item.disabled}
        className={`w3a-dropdown-menu-item${disabledClass}${classNameProps}${highlightedClass}`}
        style={style}
        onClick={handleClick}
      >
        <div className="w3a-dropdown-menu-item-icon">
          {item.icon}
        </div>
        <div className="w3a-dropdown-menu-item-content">
          <div className="w3a-dropdown-menu-item-label">
            {item.label}
          </div>
          <div className="w3a-dropdown-menu-item-description">
            {item.description}
          </div>
        </div>
      </button>
    );
  }
));
