const DEV_HOST_RE = /localhost|127\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)|\.local(?:host)?$/i;

export type NodeEnvGetter = () => string | undefined;

export function getNodeEnv(): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })?.process?.env?.NODE_ENV;
}

export function isDevHost(hostname?: string | null, nodeEnv?: string): boolean {
  if (nodeEnv && nodeEnv !== 'production') return true;
  if (!hostname) return false;
  return DEV_HOST_RE.test(hostname);
}

export function normalizeOrigin(value?: string | null, base?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).origin;
  } catch {
    return null;
  }
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
