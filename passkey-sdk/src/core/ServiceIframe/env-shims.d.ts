// Minimal shims to make import.meta.env references compile in various bundlers

interface ImportMeta {
  // Vite/Rollup inject an env object at build time
  readonly env?: Record<string, string>;
}

declare var process: { env?: Record<string, string | undefined> };

