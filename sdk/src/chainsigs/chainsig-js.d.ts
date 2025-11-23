declare module 'chainsig.js' {
  // Minimal ambient declaration so TypeScript accepts dynamic imports.
  // The concrete surface is intentionally left as `any` to avoid coupling
  // SDK types to a specific chainsig.js version.
  const mod: any;
  export = mod;
}

