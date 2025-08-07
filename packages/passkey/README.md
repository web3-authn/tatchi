# @web3authn/passkey

> **⚠️ Development Note**: worker files are copied to `frontend/public/workers/` for development. The code is environment-aware and will automatically use the correct paths in production. This ensures robust operation across different deployment scenarios.

Web3Authn Passkey SDK for NEAR Protocol integration with React components and TypeScript support.


## Installation

```bash
pnpm add @web3authn/passkey
# or
npm install @web3authn/passkey
# or
yarn add @web3authn/passkey
```


### Building from Source

> **Note**: The following requirements are only for SDK development. End users installing the package via npm/pnpm don't need Rust, Bun, or any build tools.

#### Prerequisites

This SDK includes Rust-based WASM modules and uses Bun for worker compilation. You'll need:

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install Bun (for TypeScript worker compilation)
curl -fsSL https://bun.sh/install | bash

# Install pnpm (recommended package manager)
npm install -g pnpm
```

#### Building

```bash
git clone https://github.com/near/passkey.git
cd passkey/packages/passkey
pnpm install

# Build complete SDK (includes WASM compilation and TypeScript worker bundling)
pnpm run build

# For development with file watching
pnpm run dev
```

#### Build System

The SDK uses a hybrid build system:
- **Rolldown** for main library bundling (ESM/CJS)
- **Bun** for TypeScript worker compilation (better TypeScript support)
- **wasm-pack** for Rust WASM modules

```bash
# Full build (WASM + TypeScript + bundling)
pnpm run build

# Check if build is up to date
pnpm run build:check:fresh

# Development with file watching
pnpm run dev
```

### Testing

```bash
pnpm test           # Run E2E tests with Playwright
pnpm run lint       # Lint code
pnpm run type-check # TypeScript type checking
```

### Project Structure

```
src/
├── core/              # Framework-agnostic core
│   ├── PasskeyManager.ts
│   ├── WebAuthnManager.ts
│   ├── types.ts
│   ├── web3authn-signer.worker.ts    # NEAR transaction signing worker
│   ├── web3authn-vrf.worker.ts       # VRF challenge generation worker
│   └── utils/
├── react/             # React-specific exports
│   ├── components/
│   ├── hooks/
│   ├── context/
│   └── index.ts
├── wasm_signer_worker/    # Rust WASM module for signing
├── wasm_vrf_worker/       # Rust WASM module for VRF
└── index.ts               # Main entry point
```

#### Build Configuration

The build system uses centralized configuration files:

```
build-paths.ts        # SDK filepath configs (source of truth)
build-paths.sh        # Build scripts filepaths
rolldown.config.mjs   # Rolldown bundler configuration
```

**Filepath Configuraiton Files:**
- **`build-paths.ts`** - Source of truth for all configuration
- **`build-paths.sh`** - Shell version for bash scripts


