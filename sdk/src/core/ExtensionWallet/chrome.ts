/**
 * Chrome Extension helpers
 *
 * Keep all chrome-extension environment detection and light wrappers in one place so
 * extension-specific behavior (popup flows, warm sessions, routing) can be isolated.
 */

declare const chrome: any;

export function isChromeExtensionContext(): boolean {
  // Test hook for unit tests / jsdom-like harnesses.
  try {
    const g = globalThis as any;
    if (g && g.__W3A_TEST_EXTENSION_CONTEXT === true) return true;
  } catch { }

  // Most reliable: scheme check.
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'chrome-extension:') return true;
  } catch { }

  // Fallback: runtime presence (works in extension pages and some extension frames).
  try {
    const rt = (globalThis as any)?.chrome?.runtime;
    return typeof rt?.getURL === 'function' && typeof rt?.id === 'string' && rt.id.length > 0;
  } catch {
    return false;
  }
}

export function getChromeRuntime(): any | null {
  try {
    const rt = (globalThis as any)?.chrome?.runtime;
    return rt && typeof rt.sendMessage === 'function' ? rt : null;
  } catch {
    return null;
  }
}

export async function sendRuntimeMessage<T = any>(message: any): Promise<T> {
  const runtime = getChromeRuntime();
  if (!runtime) throw new Error('Chrome extension runtime not available');
  const resp: T = await new Promise((resolve) => runtime.sendMessage(message, resolve));
  const err = runtime.lastError;
  if (err) throw new Error(err.message || String(err));
  return resp;
}

