// Ambient module declarations to support '.wasm' imports in TypeScript
// Bundlers transform WASM imports to WebAssembly.Module instances

declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}

