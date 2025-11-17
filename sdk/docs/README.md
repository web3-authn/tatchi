# Web3Authn SDK Implementation Documentation

This directory contains implementation specifications, deployment guides, and design documents for the Web3Authn SDK. These docs are intended for SDK maintainers, contributors, and advanced users building custom integrations.

## For End Users

Looking for integration guides and how-tos? See:
- **[User Documentation](../../examples/tatchi-docs/src/docs/)** - Guides, concepts, and API reference
- **[Guides](../../examples/tatchi-docs/src/docs/guides/)** - Step-by-step integration tutorials
- **[Concepts](../../examples/tatchi-docs/src/docs/concepts/)** - Architecture and design explanations

## Directory Structure

### [implementation/](./implementation/)

Technical specifications for SDK internals:

- **[shamir3pass.md](./implementation/shamir3pass.md)** - Shamir 3-pass VRF encryption, login flow, and server key rotation
- **[login-auth-sessions.md](./implementation/login-auth-sessions.md)** - VRF-backed authentication sessions implementation
- **[offline-export.md](./implementation/offline-export.md)** - Service Worker implementation for offline PWA key export
- **[iframe-isolated-signing.md](./implementation/iframe-isolated-signing.md)** - Cross-origin iframe security architecture
- **[wallet-iframe-architecture.md](./implementation/wallet-iframe-architecture.md)** - Complete technical specification for wallet iframe system

### [deployment/](./deployment/)

Production deployment specifications:

- **[wallet-scoped-credentials.md](./deployment/wallet-scoped-credentials.md)** - ROR configuration, NEAR contract integration, reference deployment topology
- **[hooks-behavior.md](./deployment/hooks-behavior.md)** - Custom hooks configuration and behavior

### [design/](./design/)

Design decisions and discussions:

- **[wallet-iframe-architecture-discussion.md](./design/wallet-iframe-architecture-discussion.md)** - Design rationale, threat model, architecture trade-offs
- **[feature_import_accounts_with_keys.md](./design/feature_import_accounts_with_keys.md)** - Account import feature design

## Quick Reference

### Registration System

Event-driven registration with 8 steps. Users can log in after step 2 while remaining steps complete in background.

**User docs**: [Passkeys Guide](../../examples/tatchi-docs/src/docs/guides/passkeys.md)

### Transaction Signing

All signing happens in WASM workers for security. Keys never touch main thread.

**User docs**: [Transaction Confirmation Guide](../../examples/tatchi-docs/src/docs/guides/tx-confirmation.md)

### Wallet Iframe

Cross-origin iframe isolation prevents XSS/supply-chain attacks from accessing keys.

**User docs**:
- [Wallet Iframe Guide](../../examples/tatchi-docs/src/docs/guides/wallet-iframe.md)
- [Wallet Iframe Architecture](../../examples/tatchi-docs/src/docs/concepts/wallet-iframe-architecture.md)

**Implementation**: [wallet-iframe-architecture.md](./implementation/wallet-iframe-architecture.md)

### Shamir 3-Pass

TouchID-free login via server-assisted VRF decryption. Server never sees plaintext keys.

**User docs**: [Passkeys Guide - Smooth Login](../../examples/tatchi-docs/src/docs/guides/passkeys.md#smooth-login-with-shamir-3-pass)

**Implementation**: [shamir3pass.md](./implementation/shamir3pass.md)

### Authentication Sessions

VRF-backed sessions reduce biometric prompts after initial login.

**User docs**: [Authentication Sessions Guide](../../examples/tatchi-docs/src/docs/guides/authentication-sessions.md)

**Implementation**: [login-auth-sessions.md](./implementation/login-auth-sessions.md)

## Contributing

When adding implementation docs:

1. **User-facing changes?** Update guides/concepts in `examples/tatchi-docs/` first
2. **Implementation details?** Add to appropriate `implementation/` subdirectory
3. **Deployment specifics?** Add to `deployment/` subdirectory
4. **Design decisions?** Document in `design/` subdirectory

Keep implementation docs focused on:
- Internal APIs and data structures
- WASM worker protocols
- IndexedDB schemas
- HTTP message formats
- Build system integration
- Production configuration details

## Additional Resources

- **[Main README](../../README.md)** - Project overview and quick start
- **[SDK Package README](../README.md)** - SDK installation and usage
- **[Example Applications](../../examples/)** - Working integration examples
