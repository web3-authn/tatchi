declare module '*.wasm' {
  const wasmModule: WebAssembly.Module | ArrayBuffer;
  export default wasmModule;
}
