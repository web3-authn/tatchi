export type TatchiWalletExtensionHandshake = {
  protocolVersion: string;
  extensionVersion: string;
};

export type DetectTatchiWalletExtensionOptions = {
  timeoutMs?: number;
};

/**
 * Best-effort detection for the Tatchi wallet extension.
 *
 * - Returns `null` when the extension is not installed, not reachable, or the
 *   current page origin is not allowlisted by the extension's `externally_connectable`.
 * - Does not require any SDK state; safe to call at app startup.
 */
export async function detectTatchiWalletExtension(
  extensionId: string,
  options: DetectTatchiWalletExtensionOptions = {}
): Promise<TatchiWalletExtensionHandshake | null> {
  const timeoutMs = Math.max(50, options.timeoutMs ?? 600);
  const runtime = (globalThis as any)?.chrome?.runtime;
  const sendMessage = runtime?.sendMessage;
  if (typeof sendMessage !== 'function') return null;

  const requestId = `w3a-ext-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const msg = { type: 'TATCHI_EXT_PING', requestId };

  return await new Promise<TatchiWalletExtensionHandshake | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    const finish = (value: TatchiWalletExtensionHandshake | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const onResponse = (resp: any) => {
      // In Chrome messaging APIs, `lastError` is populated instead of throwing
      // when the target is missing/unreachable.
      const lastError = runtime?.lastError;
      if (lastError) return finish(null);
      if (!resp || typeof resp !== 'object') return finish(null);
      if (resp.type !== 'TATCHI_EXT_PONG') return finish(null);
      const payload = resp.payload;
      if (!payload || typeof payload !== 'object') return finish(null);
      const protocolVersion = String(payload.protocolVersion || '');
      const extensionVersion = String(payload.extensionVersion || '');
      if (!protocolVersion) return finish(null);
      return finish({ protocolVersion, extensionVersion });
    };

    // Prefer web-page → extension style (extensionId first). Fall back to
    // extension-context overload (message first) for development/testing.
    try {
      sendMessage(extensionId, msg, onResponse);
      return;
    } catch {}
    try {
      sendMessage(msg, onResponse);
      return;
    } catch {
      return finish(null);
    }
  });
}

