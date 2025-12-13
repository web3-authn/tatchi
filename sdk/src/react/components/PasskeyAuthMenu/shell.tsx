import React from 'react';
import { PasskeyAuthMenuSkeletonInner } from './skeleton';
import { PasskeyAuthMenuThemeScope } from './themeScope';
import type { PasskeyAuthMenuProps } from './types';

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
  const ClientLazy = React.useMemo(() => createClientLazy(), [retryKey]);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <PasskeyAuthMenuThemeScope>
      {isClient ? (
        <LazyErrorBoundary
          onRetry={() => setRetryKey((k) => k + 1)}
          fallback={({ retry }) => (
            <div>
              <PasskeyAuthMenuSkeletonInner className={props.className} style={props.style} />
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
            fallback={
              <PasskeyAuthMenuSkeletonInner className={props.className} style={props.style} />
            }
          >
            <ClientLazy {...props} />
          </React.Suspense>
        </LazyErrorBoundary>
      ) : (
        <PasskeyAuthMenuSkeletonInner className={props.className} style={props.style} />
      )}
    </PasskeyAuthMenuThemeScope>
  );
};

export default PasskeyAuthMenu;
