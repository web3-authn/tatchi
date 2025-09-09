import React from 'react';
import { AuthMenuMode } from '.';

export interface SegmentedControlProps {
  mode: AuthMenuMode;
  onChange: (mode: AuthMenuMode) => void;
  activeBg: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  mode,
  onChange,
  activeBg,
}) => {
  const handleModeChange = (newMode: AuthMenuMode) => {
    if (newMode !== mode) onChange(newMode);
  };

  const getTransform = () => {
    switch (mode) {
      case 'register': return 'translateX(0)';
      case 'login': return 'translateX(100%)';
      case 'recover': return 'translateX(200%)';
      default: return 'translateX(0)';
    }
  };

  return (
    <div className="w3a-seg">
      <div className="w3a-seg-active" style={{ transform: getTransform(), background: activeBg }} />
      <div className="w3a-seg-grid">
        <button className={`w3a-seg-btn register${mode === 'register' ? ' is-active' : ''}`}
          onClick={() => handleModeChange('register')}
        >
          Register
        </button>
        <button className={`w3a-seg-btn login${mode === 'login' ? ' is-active' : ''}`}
          onClick={() => handleModeChange('login')}
        >
          Login
        </button>
        <button className={`w3a-seg-btn recover${mode === 'recover' ? ' is-active' : ''}`}
          onClick={() => handleModeChange('recover')}
        >
          Recover
        </button>
      </div>
    </div>
  );
};

export default SegmentedControl;
