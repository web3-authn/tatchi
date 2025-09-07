import React from 'react';

export type SegmentedMode = 'register' | 'login' | 'sync';

export interface SegmentedControlProps {
  mode: SegmentedMode;
  onChange: (mode: SegmentedMode) => void;
  activeBg: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({ mode, onChange, activeBg }) => {
  const getTransform = () => {
    switch (mode) {
      case 'register': return 'translateX(0)';
      case 'login': return 'translateX(100%)';
      case 'sync': return 'translateX(200%)';
      default: return 'translateX(0)';
    }
  };

  return (
    <div className="w3a-seg">
      <div className="w3a-seg-active" style={{ transform: getTransform(), background: activeBg }} />
      <div className="w3a-seg-grid">
        <button className={`w3a-seg-btn register${mode === 'register' ? ' is-active' : ''}`} onClick={() => onChange('register')}>Register</button>
        <button className={`w3a-seg-btn login${mode === 'login' ? ' is-active' : ''}`} onClick={() => onChange('login')}>Login</button>
        <button className={`w3a-seg-btn sync${mode === 'sync' ? ' is-active' : ''}`} onClick={() => onChange('sync')}>Sync</button>
      </div>
    </div>
  );
};

export default SegmentedControl;

