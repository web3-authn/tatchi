import React from 'react';

export interface SyncSafariThemeColorOptions {
  lightColor?: string;
  darkColor?: string;
}

/**
 * Keep Safari iOS top/bottom bar fade aligned to app theme.
 *
 * - Appends/updates a controlled `<meta name="theme-color">` at the end of <head>
 *   so it wins over any static tags declared in HTML.
 * - Chooses color by:
 *   1) explicit overrides (options.lightColor/options.darkColor), or
 *   2) computed `background-color` of <body> (fallback to <html>), or
 *   3) safe defaults (#fafafa light, #21212a dark)
 */
export function useSyncSafariThemeColor(isDark: boolean, options?: SyncSafariThemeColorOptions) {
  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const FALLBACK_LIGHT = '#fafafa';
    const FALLBACK_DARK = '#21212a';

    function isTransparent(c: string | null | undefined): boolean {
      if (!c) return true;
      const v = c.trim().toLowerCase();
      return v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'rgba(0,0,0,0)';
    }

    function pickBackgroundColor(): string {
      // 1) Explicit override
      const override = isDark ? options?.darkColor : options?.lightColor;
      if (override) return override;

      // 2) Computed body/html background-color if opaque
      try {
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        if (!isTransparent(bodyBg)) return bodyBg;
      } catch {}
      try {
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        if (!isTransparent(htmlBg)) return htmlBg;
      } catch {}

      // 3) Safe defaults
      return isDark ? FALLBACK_DARK : FALLBACK_LIGHT;
    }

    const desired = pickBackgroundColor();
    try {
      let meta = document.querySelector('meta[name="theme-color"][data-w3a-controlled]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('data-w3a-controlled', '');
        document.head.appendChild(meta);
      }
      if (meta.getAttribute('content') !== desired) {
        meta.setAttribute('content', desired);
      }
    } catch {}
  }, [isDark, options?.lightColor, options?.darkColor]);
}

