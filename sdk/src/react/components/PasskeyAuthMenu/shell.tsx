import React from 'react';
import { PasskeyAuthMenuSkeletonInner } from './skeleton';
import { PasskeyAuthMenuThemeScope } from './themeScope';
import type { PasskeyAuthMenuProps } from './types';
import { useTheme } from '../theme';
import { preloadPasskeyAuthMenu } from './preload';

function createClientLazy() {
  return React.lazy(() => import('./client').then((m) => ({ default: m.PasskeyAuthMenuClient })));
}

class LazyErrorBoundary extends React.Component<
  {
    fallback: (args: { error: Error; retry: () => void }) => React.ReactNode;
    onRetry: () => void;
    children: React.ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, retry: this.retry });
    }
    return this.props.children;
  }
}

/**
 * `PasskeyAuthMenu` — SSR-safe shell.
 *
 * - Server: renders a skeleton only.
 * - Client: lazy-loads the full implementation after mount.
 */
export const PasskeyAuthMenu: React.FC<PasskeyAuthMenuProps> = (props) => {
  const [isClient, setIsClient] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);
  const [stylesReady, setStylesReady] = React.useState(false);
  const ClientLazy = React.useMemo(() => createClientLazy(), [retryKey]);
  const skeletonRootRef = React.useRef<HTMLDivElement | null>(null);

  // Align with the SDK Theme boundary when present (TatchiPasskeyProvider wraps one by default).
  // Falls back to system preference when used standalone.
  const { theme } = useTheme();

  React.useEffect(() => {
    setIsClient(true);
    // Start fetching the client chunk immediately; we’ll still gate showing it on `stylesReady`.
    preloadPasskeyAuthMenu();
  }, []);

  // Avoid FOUC when PasskeyAuthMenu is code-split and styles are still streaming in:
  // keep rendering the skeleton until we can observe CSS being applied.
  React.useEffect(() => {
    if (!isClient) return;
    if (stylesReady) return;
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
      setStylesReady(true);
      return;
    }

    let cancelled = false;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const maxWaitMs = 1500;

    const tick = () => {
      if (cancelled) return;
      const el = skeletonRootRef.current;
      if (el) {
        try {
          const cs = window.getComputedStyle(el);
          const sentinelReady = cs.getPropertyValue('--w3a-pam2-css-ready').trim() === '1';
          // Back-compat heuristic if the sentinel is ever missing.
          const borderOk = cs.borderTopStyle !== 'none' && cs.borderTopWidth !== '0px';
          const radiusOk = cs.borderTopLeftRadius !== '0px';
          if (sentinelReady || borderOk || radiusOk) {
            setStylesReady(true);
            return;
          }
        } catch {}
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - start >= maxWaitMs) {
        setStylesReady(true);
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [isClient, stylesReady]);

  const skeletonWithRef = (
    <PasskeyAuthMenuSkeletonInner
      ref={skeletonRootRef}
      className={props.className}
      style={props.style}
    />
  );

  const skeleton = (
    <PasskeyAuthMenuSkeletonInner className={props.className} style={props.style} />
  );

  return (
    <PasskeyAuthMenuThemeScope theme={theme}>
      {isClient && stylesReady ? (
        <LazyErrorBoundary
          onRetry={() => setRetryKey((k) => k + 1)}
          fallback={({ retry }) => (
            <div>
              {skeleton}
              <div style={{ marginTop: 10, fontSize: 12, textAlign: 'center', opacity: 0.9 }}>
                Failed to load menu.{' '}
                <button type="button" onClick={retry} style={{ textDecoration: 'underline' }}>
                  Retry
                </button>
              </div>
            </div>
          )}
        >
          <React.Suspense
            fallback={skeleton}
          >
            <ClientLazy {...props} />
          </React.Suspense>
        </LazyErrorBoundary>
      ) : (
        skeletonWithRef
      )}
    </PasskeyAuthMenuThemeScope>
  );
};

export default PasskeyAuthMenu;
