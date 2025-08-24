import { LogOut } from 'lucide-react';
import { memo } from 'react';
import type { LogoutMenuItemProps } from './types';

export const LogoutMenuItem: React.FC<LogoutMenuItemProps> = memo(({
  onLogout,
  className,
  style
}) => {
  return (
    <button
      className={`w3a-dropdown-menu-item ${className || ''}`}
      style={style}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onLogout();
      }}
    >
      <div className="w3a-dropdown-menu-item-icon">
        <LogOut />
      </div>
      <div className="w3a-dropdown-menu-item-content">
        <div className="w3a-dropdown-menu-item-label">
          Log out
        </div>
      </div>
    </button>
  );
})