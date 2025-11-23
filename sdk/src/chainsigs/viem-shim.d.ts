declare module 'viem' {
  // Minimal ambient declaration so TypeScript accepts dynamic imports when
  // building the SDK. Applications should use viem's own type declarations.
  const mod: any;
  export = mod;
}

