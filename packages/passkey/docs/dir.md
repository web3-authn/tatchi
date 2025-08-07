# Repository Structure

This document provides a comprehensive overview of the `reveries-passkey` repository structure, explaining the purpose and organization of each component.

## Overview

`reveries-passkey` is a monorepo containing a complete WebAuthn-based authentication system for the NEAR blockchain. It consists of:

- **SDK Package** (`packages/passkey/`) - Core TypeScript/JavaScript SDK
- **Smart Contract** (`webauthn-contract/`) - NEAR smart contract for WebAuthn authentication
- **Frontend Demo** (`frontend/`) - React-based demonstration application
- **Relay Server** (`relay-server/`) - Minimal Express server for account creation
- **Documentation** (`docs/`) - Technical documentation and guides

## Root Directory

```
reveries-passkey/
├── packages/          # Monorepo packages
├── frontend/          # React demo application
├── webauthn-contract/ # NEAR smart contract (Rust)
├── relay-server/      # Minimal Express server
├── docs/              # Documentation
├── .github/           # GitHub workflows and templates
├── .vscode/           # VS Code configuration
├── target/            # Rust build artifacts
├── node_modules/      # Root dependencies
├── Cargo.toml         # Root Rust workspace configuration
├── Cargo.lock         # Rust dependency lock file
├── package.json       # Root package configuration
├── npm_link_sdk.sh    # Development linking script
├── commands.sh        # Common development commands
├── README.md          # Main project documentation
└── .gitignore         # Git ignore patterns
```

## Core SDK Package (`packages/passkey/`)

The main SDK package that provides WebAuthn authentication for NEAR accounts.

### Structure

```
packages/passkey/
├── src/                    # Source code
│   ├── core/              # Core SDK functionality
│   ├── react/             # React components and hooks
│   ├── server/            # Server-side utilities
│   ├── utils/             # Utility functions
│   ├── wasm_signer_worker/ # WASM signer worker
│   ├── wasm_vrf_worker/   # WASM VRF worker
│   ├── __tests__/         # Test files
│   ├── config.ts          # SDK configuration
│   └── index.ts           # Main SDK entry point
├── dist/                  # Built distribution files
├── docs/                  # Package-specific documentation
├── scripts/               # Build and utility scripts
├── test-results/          # Test output
├── playwright-report/     # E2E test reports
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript configuration
├── tsconfig.build.json    # Build-specific TS config
├── rolldown.config.ts     # Bundling configuration
├── build-paths.ts         # Build path definitions
├── build-paths.sh         # Build path shell script
├── playwright.config.ts   # E2E test configuration
├── .eslintrc.js          # ESLint configuration
└── README.md             # Package documentation
```

### Core SDK Components (`src/core/`)

```
src/core/
├── types/                 # TypeScript type definitions
├── PasskeyManager/        # Main passkey management logic
├── WebAuthnManager/       # WebAuthn integration
├── IndexedDBManager/      # Local storage management
├── wasm/                  # WASM integration utilities
├── NearClient.ts          # NEAR blockchain client
├── web3authn-signer.worker.ts  # Signer worker implementation
└── web3authn-vrf.worker.ts     # VRF worker implementation
```

### React Components (`src/react/`)

```
src/react/
├── components/            # React components
│   ├── icons/            # Icon components
│   └── ProfileSettingsButton/  # Profile settings UI
├── hooks/                # Custom React hooks
├── context/              # React context providers
├── styles.css            # Component styles
├── types.ts              # React-specific types
└── index.ts              # React package entry point
```

### Server Utilities (`src/server/`)

```
src/server/
├── core/                 # Server-side core logic
│   ├── types.ts          # Server type definitions
│   ├── config.ts         # Server configuration
│   └── NearAccountService.ts  # Account creation service
├── index.ts              # Server package entry point
└── README.md             # Server documentation
```

## Smart Contract (`webauthn-contract/`)

NEAR smart contract written in Rust that handles WebAuthn authentication and account management.

### Structure

```
webauthn-contract/
├── src/                  # Rust source code
│   ├── utils/            # Utility modules
│   │   ├── mod.rs        # Module declarations
│   │   ├── p256_utils.rs # P-256 curve utilities
│   │   ├── parsers.rs    # Webauthn data parsing utilities
│   │   ├── validation.rs # Webauthn validation utilities
│   │   ├── verifiers.rs  # Verification logic
│   │   └── vrf_verifier/ # VRF verification
│   ├── lib.rs            # Main contract entry point
│   ├── contract_state.rs # Contract state management
│   ├── types.rs          # Contract type definitions
│   ├── errors.rs         # Error definitions
│   ├── admin.rs          # Admin functions
│   ├── authenticators.rs # Authenticator management
│   ├── link_device.rs    # Device linking logic
│   ├── verify_registration_response.rs  # Registration verification
│   └── verify_authentication_response.rs # Authentication verification
├── tests/                # Contract tests
├── deploy.sh             # Production deployment script
├── deploy-dev.sh         # Development deployment script
├── upgrade.sh            # Production upgrade script
├── upgrade-dev.sh        # Development upgrade script
├── Cargo.toml            # Rust dependencies
├── Cargo.lock            # Dependency lock file
├── env.example           # Environment variables template
└── README.md             # Contract documentation
```

## Frontend Demo (`frontend/`)

React-based demonstration application showing how to use the SDK.

### Structure

```
frontend/
├── src/                  # React source code
│   ├── components/       # React components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom hooks
│   ├── utils/           # Utility functions
│   ├── config.ts        # Frontend configuration
│   ├── types.ts         # Type definitions
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles
├── public/              # Static assets
│   └── sdk/             # SDK assets (copied from packages/passkey)
├── certs/               # SSL certificates for HTTPS
├── package.json         # Frontend dependencies
├── vite.config.ts       # Vite build configuration
├── tsconfig.json        # TypeScript configuration
├── index.html           # HTML entry point
├── Caddyfile            # Caddy web server configuration
├── run_caddy.sh         # Caddy startup script
└── README.md            # Frontend documentation
```

## Relay Server (`relay-server/`)

Minimal Express server that provides account creation services using the SDK.

### Structure

```
relay-server/
├── src/                 # Server source code
│   └── index.ts         # Main server file (consolidated routes)
├── dist/                # Compiled JavaScript
├── package.json         # Server dependencies
├── tsconfig.json        # TypeScript configuration
├── env.example          # Environment variables template
└── README.md            # Server documentation
```

## Documentation (`docs/`)

Technical documentation covering various aspects of the system.

### Files

- `browser_secure_enclave.md` - Browser secure enclave integration
- `comparison_to_simplewebauthn.md` - Comparison with SimpleWebAuthn
- `create_account_and_verify_integration.md` - Account creation and verification
- `dual_prf_key_derivation.md` - Dual PRF key derivation
- `link_device_by_QR_code.md` - QR code device linking
- `session_scoped_webauthn_auth.md` - Session-scoped authentication
- `user_friendly_api_examples.md` - API usage examples
- `vrf_challenges.md` - VRF challenge system

## Key Configuration Files

### Root Level
- `Cargo.toml` - Rust workspace configuration
- `package.json` - Node.js workspace configuration
- `npm_link_sdk.sh` - Development linking script
- `commands.sh` - Common development commands

### SDK Package
- `rolldown.config.ts` - Bundling configuration for multiple entry points
- `build-paths.ts` - Build path definitions
- `playwright.config.ts` - E2E testing configuration
- `tsconfig.json` - TypeScript configuration

### Frontend
- `vite.config.ts` - Vite build configuration
- `Caddyfile` - HTTPS development server configuration

### Smart Contract
- `Cargo.toml` - Rust dependencies and build configuration
- `deploy.sh` / `deploy-dev.sh` - Deployment scripts
- `upgrade.sh` / `upgrade-dev.sh` - Contract upgrade scripts

## Development Workflow

1. **SDK Development**: Work in `packages/passkey/`
2. **Contract Development**: Work in `webauthn-contract/`
3. **Frontend Testing**: Use `frontend/` to test SDK integration
4. **Server Testing**: Use `relay-server/` for server-side functionality
5. **Linking**: Use `npm_link_sdk.sh` for local development

## Build Outputs

- `packages/passkey/dist/` - Built SDK files (ESM/CJS)
- `frontend/public/sdk/` - SDK assets for frontend
- `webauthn-contract/target/` - Rust build artifacts
- `relay-server/dist/` - Compiled server JavaScript

## Environment Configuration

Each component has its own environment configuration:
- `webauthn-contract/env.example` - Contract deployment variables
- `relay-server/env.example` - Server configuration variables
- `frontend/` - Uses Caddy for HTTPS development

This structure provides a complete, modular system for WebAuthn-based NEAR authentication with clear separation of concerns and comprehensive documentation.