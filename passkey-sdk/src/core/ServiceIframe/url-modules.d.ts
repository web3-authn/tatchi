// Ambient module declarations to support '?url' imports in TypeScript
// Many bundlers (Vite/Rollup) transform '?url' to a string asset URL at build time.

declare module '*?url' {
  const url: string;
  export default url;
}

