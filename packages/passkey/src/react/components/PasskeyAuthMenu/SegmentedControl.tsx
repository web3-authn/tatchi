import React from 'react';
import { AuthMenuMode } from '.';

export interface SegmentedControlProps {
  mode: AuthMenuMode;
  onChange: (mode: AuthMenuMode) => void;
  activeBg: string;
  defaultMode?: AuthMenuMode;
  accountExists?: boolean;
  onReset?: () => void;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  mode,
  onChange,
  activeBg,
  defaultMode,
  accountExists = false,
  onReset
}) => {
  // Track if the user has manually interacted with the tabs
  const userTouchedModeRef = React.useRef(false);
  // Track if we've initialized the mode
  const didInitModeRef = React.useRef(false);
  // Internal mode state for auto-inference logic
  const [internalMode, setInternalMode] = React.useState<AuthMenuMode>(() => {
    // Initial mode: prefer defaultMode, otherwise infer from accountExists
    if (defaultMode) return defaultMode;
    return accountExists ? 'login' : 'register';
  });

  // Initialize mode on mount
  React.useEffect(() => {
    if (!didInitModeRef.current) {
      const initialMode = defaultMode ?? (accountExists ? 'login' : 'register');
      setInternalMode(initialMode);
      onChange(initialMode);
      didInitModeRef.current = true;
    }
  }, []);

  // Handle defaultMode override: if provided, use it as the initial and follow changes
  React.useEffect(() => {
    if (typeof defaultMode === 'undefined') return;
    if (userTouchedModeRef.current) return; // Don't override user choice
    if (defaultMode !== internalMode) {
      setInternalMode(defaultMode);
      onChange(defaultMode);
    }
  }, [defaultMode, internalMode, onChange]);

  // Handle automatic inference: if no defaultMode, infer from accountExists
  React.useEffect(() => {
    if (typeof defaultMode !== 'undefined') return; // Don't infer if defaultMode is provided
    if (userTouchedModeRef.current) return; // Don't override user choice
    const inferredMode: AuthMenuMode = accountExists ? 'login' : 'register';
    if (inferredMode !== internalMode) {
      setInternalMode(inferredMode);
      onChange(inferredMode);
    }
  }, [accountExists, defaultMode, internalMode, onChange]);

  // Handle reset behavior
  React.useEffect(() => {
    if (onReset) {
      // Reset user interaction tracking
      userTouchedModeRef.current = false;
      // Re-apply the same rules: use defaultMode if provided, otherwise infer
      const resetMode = defaultMode ?? (accountExists ? 'login' : 'register');
      setInternalMode(resetMode);
      onChange(resetMode);
    }
  }, [onReset, defaultMode, accountExists, onChange]);

  const handleModeChange = (newMode: AuthMenuMode) => {
    userTouchedModeRef.current = true; // Mark that user has interacted
    setInternalMode(newMode);
    onChange(newMode);
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
