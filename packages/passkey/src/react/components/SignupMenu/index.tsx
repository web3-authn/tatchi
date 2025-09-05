import React from 'react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemeScope } from '../theme/ThemeScope';
import { useTheme } from '../theme/useTheme';
import {
  ArrowLeft,
  Chrome,
  Github,
  Apple,
  Gamepad2,
  Fingerprint,
  ArrowRight,
} from 'lucide-react';

export type SignupMode = 'register' | 'login';

export interface SignupMenuProps {
  title?: string;
  defaultMode?: SignupMode;
  onClose?: () => void;
  onBeginPasskeyLogin?: (mode: SignupMode) => void;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * SignupMenu (React-only)
 * - Uses theme tokens from design-tokens.ts via ThemeProvider/useTheme
 * - Segmented Register/Login with animated highlight
 * - Arrow proceeds to a simple "Waiting for Passkey" view with spinner
 */
const SignupMenuInner: React.FC<SignupMenuProps> = ({
  title = 'Sign In',
  defaultMode = 'login',
  onClose,
  onBeginPasskeyLogin,
  style,
  className,
}) => {
  const { tokens, isDark } = useTheme();
  const [mode, setMode] = React.useState<SignupMode>(defaultMode);
  const [waiting, setWaiting] = React.useState(false);
  const [userInput, setUserInput] = React.useState('');
  const [arrowHovered, setArrowHovered] = React.useState(false);
  const [arrowPressed, setArrowPressed] = React.useState(false);
  const [backHovered, setBackHovered] = React.useState(false);
  const [backPressed, setBackPressed] = React.useState(false);
  const [socialHovered, setSocialHovered] = React.useState<number | null>(null);
  const [socialPressed, setSocialPressed] = React.useState<number | null>(null);
  const [segHovered, setSegHovered] = React.useState<SignupMode | null>(null);
  const [segPressed, setSegPressed] = React.useState<SignupMode | null>(null);

  const bg = tokens.colors.surfacePrimary;
  const panel = tokens.colors.surfaceSecondary;
  const text = tokens.colors.textPrimary;
  const textMuted = tokens.colors.textSecondary;
  const border = tokens.colors.borderSecondary;

  const onArrowClick = () => {
    setWaiting(true);
    onBeginPasskeyLogin?.(mode);
  };

  const onResetToStart = () => {
    setWaiting(false);
    setMode(defaultMode);
    setUserInput('');
  };

  const pillCommon: React.CSSProperties = {
    background: panel,
    borderRadius: tokens.borderRadius.xl,
    boxShadow: tokens.shadows.md,
  };

  // Slightly darker than before for clearer contrast
  const segActiveBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return (
    <div
      className={`w3a-signup-menu-root${className ? ` ${className}` : ''}`}
      style={{
        width: 420,
        maxWidth: '90vw',
        color: text,
        background: bg,
        borderRadius: '2rem',
        boxShadow: tokens.shadows.xl,
        padding: tokens.spacing.lg,
        paddingTop: `calc(${tokens.spacing.lg} + 4px)`,
        position: 'relative',
        ...style,
      }}
    >
      {/* Back button (only during waiting) */}
      {/* Back button (persisted for fade/scale animation) */}
      <button
          aria-label="Back"
          onClick={onResetToStart}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            width: 36,
            height: 36,
            padding: 0,
            aspectRatio: '1 / 1',
            display: 'grid',
            placeItems: 'center',
            lineHeight: 0,
            borderRadius: '50%',
            color: text,
            background: backHovered ? tokens.colors.surfaceTertiary : panel,
            boxShadow: backPressed ? '0 2px 6px rgba(0,0,0,0.25)' : tokens.shadows.sm,
            cursor: 'pointer',
            border: 'none',
            zIndex: 3,
            transform: backPressed ? 'scale(0.96)' : (backHovered ? 'scale(1.02)' : 'scale(1)'),
            transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 160ms ease, opacity 220ms ease',
            opacity: waiting ? 1 : 0,
            pointerEvents: waiting ? 'auto' : 'none',
            filter: waiting ? 'none' : 'blur(0.2px)',
          }}
          onMouseEnter={() => setBackHovered(true)}
          onMouseLeave={() => { setBackHovered(false); setBackPressed(false); }}
          onMouseDown={() => setBackPressed(true)}
          onMouseUp={() => setBackPressed(false)}
          onTouchStart={() => setBackPressed(true)}
          onTouchEnd={() => setBackPressed(false)}
        >
          <ArrowLeft size={18} strokeWidth={2.25} style={{ display: 'block' }} />
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: tokens.spacing.sm, minHeight: 28 }}>
        {!waiting && <div style={{ fontSize: 24, fontWeight: 700 }}>{title}</div>}
      </div>

      {/* Content switcher */}
      <div
        aria-hidden={waiting}
        style={{
          opacity: waiting ? 0 : 1,
          transform: waiting ? 'scale(0.98) translateY(-6px)' : 'scale(1) translateY(0)',
          filter: waiting ? 'blur(1px)' : 'none',
          transformOrigin: 'top center',
          transition: 'opacity 240ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 240ms ease',
          willChange: 'opacity, transform, filter',
          pointerEvents: waiting ? 'none' : 'auto',
        }}
      >
        {/* Social providers row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: tokens.spacing.sm,
          opacity: waiting ? 0 : 1,
          transform: waiting ? 'translateY(-6px) scale(0.98)' : 'translateY(0) scale(1)',
          transition: 'opacity 260ms ease, transform 260ms ease',
          transitionDelay: waiting ? '0ms' : '40ms',
          willChange: 'opacity, transform'
        }}>
          {[Chrome, Gamepad2, Github, Apple].map((Icon, i) => {
            const hovered = socialHovered === i;
            const pressed = socialPressed === i;
            const baseIconColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)';
            const hoverIconColor = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';
            return (
              <button
                key={i}
                style={{
                  ...pillCommon,
                  height: 48,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: hovered ? hoverIconColor : baseIconColor,
                  overflow: 'hidden',
                  border: 'none',
                  background: pressed ? tokens.colors.surfaceTertiary : hovered ? tokens.colors.hover : panel,
                  boxShadow: pressed ? '0 2px 6px rgba(0,0,0,0.22)' : tokens.shadows.md,
                  transform: pressed ? 'scale(0.98)' : hovered ? 'scale(1.02)' : 'scale(1)',
                  transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 160ms ease',
                }}
                title={i === 0 ? 'Google' : i === 1 ? 'Discord' : i === 2 ? 'GitHub' : 'Apple'}
                onMouseEnter={() => setSocialHovered(i)}
                onMouseLeave={() => { setSocialHovered(null); setSocialPressed(null); }}
                onMouseDown={() => setSocialPressed(i)}
                onMouseUp={() => setSocialPressed(null)}
                onTouchStart={() => setSocialPressed(i)}
                onTouchEnd={() => setSocialPressed(null)}
              >
                <Icon size={22} color={hovered ? hoverIconColor : baseIconColor} style={{ display: 'block' }} />
              </button>
            );
          })}
        </div>

        {/* Passkey row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: tokens.spacing.sm,
          opacity: waiting ? 0 : 1,
          transform: waiting ? 'translateY(-6px) scale(0.985)' : 'translateY(0) scale(1)',
          transition: 'opacity 260ms ease, transform 260ms ease',
          transitionDelay: waiting ? '0ms' : '90ms',
          willChange: 'opacity, transform'
        }}>
          <div style={{
            ...pillCommon,
            height: 48,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            gap: 8,
            border: 'none',
            boxShadow: `${tokens.shadows.sm}, inset 0 0 0 1px rgba(0,0,0,0.35)`,
          }}>
            <Fingerprint size={20} />
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onArrowClick(); }}
              placeholder={mode === 'login' ? 'Login with Passkey' : 'Register with Passkey'}
              style={{
                flex: 1,
                height: 32,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: text,
                fontSize: 16,
              }}
            />
          </div>
          <button
            aria-label="Continue"
            onClick={onArrowClick}
            style={{
              height: 48,
              width: 64,
              borderRadius: 16,
              background: arrowHovered ? tokens.colors.primaryHover : tokens.colors.primary,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 0,
              cursor: 'pointer',
              boxShadow: `${arrowPressed ? '0 4px 8px rgba(0,0,0,0.25)' : tokens.shadows.md}, inset 0 0 0 2px rgba(255,255,255,0.15)`,
              border: 'none',
              transform: arrowPressed ? 'scale(0.985)' : (arrowHovered ? 'scale(1.02)' : 'scale(1)'),
              transition: 'transform 120ms ease, box-shadow 120ms ease, background-color 160ms ease',
            }}
            onMouseEnter={() => setArrowHovered(true)}
            onMouseLeave={() => { setArrowHovered(false); setArrowPressed(false); }}
            onMouseDown={() => setArrowPressed(true)}
            onMouseUp={() => setArrowPressed(false)}
            onTouchStart={() => setArrowPressed(true)}
            onTouchEnd={() => setArrowPressed(false)}
          >
            <ArrowRight size={20} strokeWidth={2.5} color="#ffffff" style={{ display: 'block' }} />
          </button>
        </div>

        {/* Segmented control: Register | Login */}
        <div style={{
          position: 'relative',
          ...pillCommon,
          height: 52,
          overflow: 'hidden',
          padding: 5,
          border: 'none',
          background: tokens.colors.surfaceTertiary,
          boxShadow: `${tokens.shadows.sm}, inset 0 0 0 1px rgba(0,0,0,0.35)`,
          opacity: waiting ? 0 : 1,
          transform: waiting ? 'translateY(-6px) scale(0.985)' : 'translateY(0) scale(1)',
          transition: 'opacity 260ms ease, transform 260ms ease',
          transitionDelay: waiting ? '0ms' : '140ms',
          willChange: 'opacity, transform'
        }}>
          {/* Active pill */}
          <div
            style={{
              position: 'absolute',
              top: 5,
              bottom: 5,
              left: 6,
              width: 'calc(50% - 6px)',
              borderRadius: 14,
              background: segActiveBg,
              transition: 'transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              willChange: 'transform',
              transform: `translateX(${mode === 'login' ? '100%' : '0'})`,
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%', position: 'relative', zIndex: 1 }}>
            <button
              onClick={() => setMode('register')}
              onMouseEnter={() => setSegHovered('register')}
              onMouseLeave={() => { if (segHovered === 'register') setSegHovered(null); if (segPressed === 'register') setSegPressed(null); }}
              onMouseDown={() => setSegPressed('register')}
              onMouseUp={() => setSegPressed(null)}
              onTouchStart={() => setSegPressed('register')}
              onTouchEnd={() => setSegPressed(null)}
              style={{
                height: '100%',
                borderRadius: 12,
                background: 'transparent',
                color: mode === 'register' ? text : textMuted,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                transition: 'color 200ms ease, transform 120ms ease',
                transform: segPressed === 'register' ? 'scale(0.98)' : segHovered === 'register' ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              Register
            </button>
            <button
              onClick={() => setMode('login')}
              onMouseEnter={() => setSegHovered('login')}
              onMouseLeave={() => { if (segHovered === 'login') setSegHovered(null); if (segPressed === 'login') setSegPressed(null); }}
              onMouseDown={() => setSegPressed('login')}
              onMouseUp={() => setSegPressed(null)}
              onTouchStart={() => setSegPressed('login')}
              onTouchEnd={() => setSegPressed(null)}
              style={{
                height: '100%',
                borderRadius: 12,
                background: 'transparent',
                color: mode === 'login' ? text : textMuted,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                transition: 'color 200ms ease, transform 120ms ease',
                transform: segPressed === 'login' ? 'scale(0.98)' : segHovered === 'login' ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              Login
            </button>
          </div>
        </div>
      </div>

      {/* Waiting overlay */}
      <div
        style={{
          position: 'absolute',
          inset: tokens.spacing.lg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: 'transparent',
          textAlign: 'center',
          zIndex: 2,
          opacity: waiting ? 1 : 0,
          transform: waiting ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(6px)',
          transition: 'opacity 240ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          willChange: 'opacity, transform',
          pointerEvents: waiting ? 'auto' : 'none',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, opacity: waiting ? 1 : 0, transition: 'opacity 220ms ease', transitionDelay: waiting ? '80ms' : '0ms' }}>Waiting for Passkey…</div>
        <div
          aria-label="Loading"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: tokens.colors.primary,
            animation: 'w3a-spin 0.9s linear infinite',
            opacity: waiting ? 1 : 0,
            transition: 'opacity 220ms ease',
            transitionDelay: waiting ? '140ms' : '0ms'
          }}
        />
      </div>

      {/* Local keyframes */}
      <style>{`
        @keyframes w3a-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        /* Button resets for consistent look */
        button { border: none; outline: none; }
        button:focus-visible { box-shadow: 0 0 0 2px ${tokens.colors.focus}55; }
        .w3a-signup-menu-root input::placeholder { color: ${textMuted}; opacity: 0.7; }
      `}</style>
    </div>
  );
};

export const SignupMenu: React.FC<SignupMenuProps> = (props) => (
  <ThemeProvider>
    <ThemeScope>
      <SignupMenuInner {...props} />
    </ThemeScope>
  </ThemeProvider>
);

export default SignupMenu;
