import React from 'react';

export interface ContentSwitcherProps {
  waiting: boolean;
  waitingText?: string;
  showScanDevice?: boolean;
  showQRCodeElement?: React.ReactNode;
  children: React.ReactNode;
  backButton?: React.ReactNode;
}

export const ContentSwitcher: React.FC<ContentSwitcherProps> = ({
  waiting,
  waitingText = 'Waiting for Passkey…',
  showScanDevice = false,
  showQRCodeElement,
  children,
  backButton,
}) => {
  // Animate height of the switcher as content changes
  const switcherRef = React.useRef<HTMLDivElement | null>(null);
  const contentAreaRef = React.useRef<HTMLDivElement | null>(null);
  const sizerRef = React.useRef<HTMLDivElement | null>(null);

  // Track whether user prefers reduced motion
  const prefersReducedMotion = React.useMemo(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Helper to read current content height and apply to the switcher
  const syncHeight = React.useCallback(() => {
    const wrap = switcherRef.current;
    const sizer = sizerRef.current;
    if (!wrap || !sizer) return;
    // Use scrollHeight to capture intrinsic content size regardless of flex context
    const next = sizer.scrollHeight;
    if (prefersReducedMotion) {
      // Apply without animation
      wrap.style.transition = 'none';
      wrap.style.height = `${next}px`;
      // Force reflow then restore transition so future changes can animate
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      wrap.offsetHeight;
      wrap.style.transition = '';
      return;
    }
    // Normal path: let CSS transition handle the interpolation
    wrap.style.height = `${next}px`;
  }, [prefersReducedMotion]);

  // Observe size changes of the content area
  React.useLayoutEffect(() => {
    const area = contentAreaRef.current;
    const sizer = sizerRef.current;
    if (!area || !sizer) return;

    // Initial sync after mount/update
    syncHeight();

    // ResizeObserver to capture dynamic content changes (e.g., QR render)
    const ro = new ResizeObserver(() => {
      // Use rAF to coalesce layout reads/writes with rendering
      requestAnimationFrame(syncHeight);
    });
    ro.observe(sizer);

    // Re-sync after fonts load (text metrics can change)
    try {
      // @ts-ignore optional fonts API
      const fonts = (document as any)?.fonts;
      if (fonts?.ready) {
        fonts.ready.then(() => syncHeight()).catch(() => {});
      }
    } catch {}

    // Also re-sync on window resize
    const onResize = () => syncHeight();
    window.addEventListener('resize', onResize);

    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', onResize);
    };
  }, [syncHeight, waiting, showScanDevice, children]);

  return (
    <div ref={switcherRef} className="w3a-content-switcher">
      {/* Back button - absolutely positioned overlay */}
      {backButton}

      {/* Content areas - conditionally rendered with smooth transitions */}
      <div ref={contentAreaRef} className="w3a-content-area">
        <div ref={sizerRef} className="w3a-content-sizer">
          {waiting && (
            <div className="w3a-waiting">
              <div className="w3a-waiting-text">{waitingText}</div>
              <div aria-label="Loading" className="w3a-spinner" />
            </div>
          )}

          {showScanDevice && (
            <div className="w3a-scan-device-content">
              {showQRCodeElement}
            </div>
          )}

          {!waiting && !showScanDevice && (
            <div className="w3a-signin-menu">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentSwitcher;
