let passkeyAuthMenuStylesPromise: Promise<void> | null = null;

const PASSKEY_MENU_LINK_ATTR = 'data-w3a-passkey-auth-menu-css';
const SDK_GLOBAL_STYLES_MARKER_VAR = '--w3a-sdk-react-styles-loaded';
const PASSKEY_MENU_STYLES_MARKER_VAR = '--w3a-passkey-auth-menu-styles-loaded';

function isCssMarkerPresent(varName: string): boolean {
  try {
    if (typeof document === 'undefined' || !document.documentElement) return false;
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(varName);
    return (v || '').trim() === '1';
  } catch {
    return false;
  }
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    // If the stylesheet is already applied, `link.sheet` should be set.
    if ((link as any).sheet) return done();
    link.addEventListener('load', done, { once: true } as AddEventListenerOptions);
    link.addEventListener('error', done, { once: true } as AddEventListenerOptions);
  });
}

function getPasskeyAuthMenuStylesHref(): string {
  return new URL('./styles.css', import.meta.url).toString();
}

/**
 * Ensure PasskeyAuthMenu styles are available in the current document.
 *
 * Notes:
 * - This is a best-effort helper to reduce FOUC when consumers lazy-load the menu.
 * - Prefer importing `@tatchi-xyz/sdk/react/styles` (or the menu-specific CSS export)
 *   in your app entry for SSR correctness.
 */
export function ensurePasskeyAuthMenuStyles(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (isCssMarkerPresent(SDK_GLOBAL_STYLES_MARKER_VAR)) return Promise.resolve();
  if (isCssMarkerPresent(PASSKEY_MENU_STYLES_MARKER_VAR)) return Promise.resolve();
  if (passkeyAuthMenuStylesPromise) return passkeyAuthMenuStylesPromise;

  passkeyAuthMenuStylesPromise = (async () => {
    try {
      const head = document.head || document.getElementsByTagName('head')[0];
      if (!head) return;

      const existing = head.querySelector(`link[${PASSKEY_MENU_LINK_ATTR}]`) as HTMLLinkElement | null;
      if (existing) {
        await waitForStylesheet(existing);
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = getPasskeyAuthMenuStylesHref();
      link.setAttribute(PASSKEY_MENU_LINK_ATTR, '');
      head.appendChild(link);
      await waitForStylesheet(link);
    } catch {
      // best-effort: never throw from a UI preload helper
    }
  })();

  return passkeyAuthMenuStylesPromise;
}
