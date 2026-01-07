export type Logger = {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
};

export type NormalizedLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

function safe(fn?: (...args: unknown[]) => void): (...args: unknown[]) => void {
  if (!fn) return () => {};
  return (...args: unknown[]) => {
    try {
      fn(...args);
    } catch {
      // Never allow logging to break request handling.
    }
  };
}

/**
 * Library code should never call `console.*` directly; the host decides where logs go.
 * - Default: no logs
 * - To enable: pass `logger: console` (or a structured logger) to the host config.
 */
export function normalizeLogger(logger?: Logger | null): NormalizedLogger {
  if (!logger) {
    return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  }

  const base: Logger = logger;
  const log = typeof base.log === 'function' ? base.log.bind(base) : undefined;

  const debug = (typeof base.debug === 'function' ? base.debug.bind(base) : log);
  const info = (typeof base.info === 'function' ? base.info.bind(base) : log);
  const warn = (typeof base.warn === 'function' ? base.warn.bind(base) : log);
  const error = (typeof base.error === 'function' ? base.error.bind(base) : log);

  return {
    debug: safe(debug),
    info: safe(info),
    warn: safe(warn),
    error: safe(error),
  };
}

export const coerceLogger = normalizeLogger;
