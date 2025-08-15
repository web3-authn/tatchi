# Web3 Authn SDK

The Web3 Authn SDK is 'deconstructed' embedded wallet that gives developers more control over the wallet UX experience. No wallet selectors, no popups (unless you or your users want it).


### Key Features

- No popups, 1-click setup for seamless user experience
- Opensource, no frills, use what you need.
- Wallet recovery via TouchID across multiple devices through Chrome and Apple iCloud passkey sync. "Not your passkey, not your key"
- Serverless WebAuthn: Uses VRF-based challenges for serverless verification - no centralized points of failure like traditional WebAuthn implementations

### Target Users

- **Web2 Developers**: Want to implement WebAuthn TouchID for their app but don't want to set up a server for it
- **Web3 Developers**: Want an embedded wallet with no popups and full control over the UX experience

## Prerequisites

### Install pnpm and bun
```bash
npm install -g pnpm
# Install Bun for TypeScript bundling
curl -fsSL https://bun.sh/install | bash
```

### Install wasm-pack
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Install wasm-pack for WebAssembly compilation
cargo install wasm-pack
```

### Install mkcert
```bash
# Install mkcert for local HTTPS development
brew install mkcert
```

### Verify All Installations
```bash
# Reload shell to ensure all tools are in PATH
source ~/.bashrc  # or source ~/.zshrc for zsh

# Check all tools are installed
node --version
pnpm --version
rustc --version
cargo --version
wasm-pack --version
bun --version
mkcert -version
```

## Development Setup

Once all prerequisites are installed, you can set up the development environment:

```bash
# Install all dependencies and build the project
pnpm run install-all
```

This command will:
- Install dependencies for all packages (root, relay-server, frontend, packages/passkey)
- Build the SDK with WASM compilation
- Set up local development links

## Available Scripts

- `pnpm run install-all` - Install all dependencies and build the project
- `pnpm run build:sdk` - Build the SDK and link it to other packages
- `pnpm run dev` - Start the frontend development server
- `pnpm run server` - Start the relay server