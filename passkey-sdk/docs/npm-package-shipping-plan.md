# NPM Package Shipping Plan

## Overview

This document outlines the strategy for shipping the Web3Authn Passkey SDK as a production-ready NPM package. The SDK includes WASM workers for cryptographic operations and requires careful consideration of bundling, distribution, and runtime requirements.

## Current State Analysis

### Package Structure
- **Main SDK**: Core passkey functionality with NEAR integration
- **React Components**: UI components for passkey management
- **Server SDK**: Server-side authentication verification
- **WASM Workers**:
  - `wasm_signer_worker`: Cryptographic signing operations
  - `wasm_vrf_worker`: Verifiable Random Function with Shamir 3-pass protocol
- **Embedded Components**: Lit-based transaction confirmation components

### Build System
- **Rolldown**: Primary bundler for TypeScript/JavaScript
- **wasm-pack**: Rust to WASM compilation
- **Bun**: Worker bundling (TypeScript support)
- **TypeScript**: Type generation and compilation

## Pre-Release Checklist

### 1. Package Configuration

#### Update package.json
```json
{
  "name": "@web3authn/passkey",
  "version": "1.0.0",
  "publishConfig": {
    "access": "public"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist/",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/src/index.d.ts"
    },
    "./server": {
      "import": "./dist/esm/server/index.js",
      "require": "./dist/cjs/server/index.js",
      "types": "./dist/types/src/server/index.d.ts"
    },
    "./react": {
      "import": "./dist/esm/react/index.js",
      "require": "./dist/cjs/react/index.js",
      "types": "./dist/types/src/react/index.d.ts"
    },
    "./react/styles": "./dist/esm/react/styles/styles.css",
    "./workers/signer": "./dist/web3authn-signer.worker.js",
    "./workers/vrf": "./dist/web3authn-vrf.worker.js",
    "./wasm/signer": {
      "import": "./dist/wasm_signer_worker.js",
      "types": "./dist/wasm_signer_worker.d.ts"
    },
    "./wasm/vrf": {
      "import": "./dist/wasm_vrf_worker/wasm_vrf_worker.js",
      "types": "./dist/wasm_vrf_worker/wasm_vrf_worker.d.ts"
    },
    "./wasm/signer-binary": "./dist/wasm_signer_worker_bg.wasm",
    "./wasm/vrf-binary": "./dist/wasm_vrf_worker/wasm_vrf_worker_bg.wasm",
    "./embedded/embedded-tx-button": "./dist/esm/react/embedded/embedded-tx-button.js",
    "./embedded/iframe-button": "./dist/esm/react/embedded/iframe-button.js"
  }
}
```

### 2. WASM Distribution Strategy

#### Binary Distribution
- Include WASM binaries in the package
- Use separate export paths for WASM files
- Ensure proper MIME type handling in consuming applications

#### Worker Distribution
- Bundle workers as standalone files
- Provide both ESM and CJS versions
- Include TypeScript definitions

### 3. Build Process Optimization

#### Automated Build Pipeline
```bash
# Pre-publish script
"prepublishOnly": "npm run build && npm run test && npm run type-check"
```

#### Build Validation
- WASM binary integrity checks
- Worker functionality tests
- Type definition completeness
- Bundle size analysis
 - Packaging validation: `publint`, `arethetypeswrong`, `npm pack` dry-run
 - Tarball size budget checks via `size-limit`
 - Smoke test by installing packed tarball in sample app

### 4. Documentation Requirements

#### README.md Updates
- Installation instructions
- Quick start guide
- WASM worker setup
- API documentation links
- Browser compatibility matrix

#### API Documentation
- JSDoc comments for all public APIs
- TypeScript definition completeness
- Usage examples for each module

## Release Strategy

### 1. Version Management

#### Semantic Versioning
- **Major**: Breaking changes in API or WASM interfaces
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, performance improvements

#### Pre-release Tags
- `alpha`: Early development releases
- `beta`: Feature-complete, testing phase
- `rc`: Release candidate

### 2. Publishing Workflow

#### Automated Publishing
```yaml
# GitHub Actions workflow
name: Publish Package
on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### Advanced CI/CD pipeline (recommended)
```yaml
name: CI
on:
  push:
    branches: [ main, dev ]
    tags: [ 'v*' ]
  pull_request:

permissions:
  contents: read
  id-token: write # for npm provenance on publish

jobs:
  test:
    name: Unit + Typecheck (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run type-check
      - run: npm run build:check:fresh || true
      - run: npm run build
      - run: npm test --silent

  e2e:
    name: Browser E2E (Playwright)
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install system deps for browsers
        run: npx playwright install --with-deps
      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable
      - name: Cache Rust
        uses: Swatinem/rust-cache@v2
      - name: Install wasm-pack
        run: cargo install wasm-pack
      - name: Setup Bun (for worker bundling)
        uses: oven-sh/setup-bun@v1
      - run: npm ci
      - run: npm run build
      - run: npx playwright test

  pack_and_verify:
    name: Pack + Packaging Lints
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Packaging lints
        run: |
          npx publint
          npx arethetypeswrong .
      - name: Create tarball
        run: npm pack --silent
      - name: Smoke install tarball
        run: |
          TARBALL=$(ls *.tgz | head -n1)
          mkdir -p /tmp/pkg-consumer && cd /tmp/pkg-consumer
          npm init -y >/dev/null
          npm i "${{ github.workspace }}/packages/passkey/${TARBALL}"
          node -e "require('@web3authn/passkey'); console.log('ok')"
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: npm-tarball
          path: ./*.tgz

  publish:
    name: Publish to npm (tagged)
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    needs: [pack_and_verify]
    environment: npm
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  canary:
    name: Publish canary (@next)
    if: github.ref == 'refs/heads/dev'
    runs-on: ubuntu-latest
    needs: [pack_and_verify]
    environment: npm
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm version prerelease --preid=next --no-git-tag-version
      - run: npm publish --tag next --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### Manual Publishing
```bash
# Development workflow
npm version patch  # or minor/major
npm run build
npm run test
npm publish
```

### Standard deployment processes (recommended)
- **Versioning**: Use Changesets or Conventional Commits to automate version bump + changelog
  - `changesets` GH action to open release PRs; publish on merge
- **Channels**: `main` publishes stable on tag, `dev` publishes canary under `next`
- **Approvals**: Protect `npm` environment for manual approval on publish job
- **Dry runs**: Always run `npm pack` and smoke-install before publish
- **Provenance**: Require `npm publish --provenance` with OIDC; restrict tokens to publish-only
- **Artifacts**: Upload built `dist/` and tarball for traceability

---

## Areas of Improvement: bundling, optimization, and testing

### Bundling & packaging
- **Unify package manager**: Prefer `pnpm` workspace or `npm`, avoid mixed lockfiles
- **Subpath exports**: Keep workers/WASM under stable subpaths; add conditionals (`browser`, `node`) if needed
- **Types**: Emit `.d.ts` with `tsc --emitDeclarationOnly`; optionally bundle with `rollup-plugin-dts`
- **Side effects**: Audit `sideEffects` to the minimal set (currently CSS only)
- **Tree-shaking**: Ensure ESM first; avoid dynamic `require` and top-level side effects
- **WASM layout**: Place all WASM assets under `dist/wasm_*/`; reference via `new URL('./path', import.meta.url)` for bundler compatibility
- **Source maps**: Ship `.map` files for all JS bundles

### Performance optimizations
- **Code splitting**: Lazy-load heavy modules (e.g., VRF paths) when feasible
- **Minification**: Enable minification in rolldown for production builds
- **Embed targets**: Keep Lit-based embeds self-contained; exclude duplicate deps
- **Bundle size budgets**: Add `size-limit` with CI budget gates

### Build system
- **Caching**: Use `Swatinem/rust-cache` and Node cache; cache wasm-pack outputs
- **Determinism**: Lock Rust and Node toolchains; pin `wasm-pack` version
- **Reproducibility**: `npm ci` only; avoid postinstall scripts

### Testing & QA
- **Cross-browser E2E**: Run Playwright on Chromium, Firefox, WebKit
- **Tarball smoke test**: Install `npm pack` output in a temp project in CI
- **Packaging lints**: `publint`, `arethetypeswrong` in CI
- **Type tests**: Add dtslint/tsd tests for public API types
- **Worker/WASM tests**: Unit tests that initialize workers and run a minimal op
- **Node vs Browser**: Verify both server (`./server`) and browser entrypoints

### Security & supply chain
- **Provenance**: Enforce publish with provenance; enable npm 2FA on tokens
- **Scanning**: Add CodeQL and OpenSSF Scorecards workflows
- **License files**: Ensure `LICENSE`, `NOTICE` included in `files`

### Developer experience
- **Docs**: Add quick-starts for bundlers (Vite, Next.js, Webpack)
- **Examples**: Provide small example apps (React, vanilla) consuming tarball
- **Errors**: Prefer explicit error messages from WASM/worker boundaries

### 3. Quality Assurance

#### Testing Strategy
- Unit tests for all modules
- Integration tests for WASM workers
- E2E tests for complete flows
- Browser compatibility tests
- Bundle size monitoring

#### Performance Benchmarks
- WASM worker initialization time
- Cryptographic operation performance
- Bundle size tracking
- Memory usage analysis

## Distribution Considerations

### 1. CDN Strategy

#### Unpkg/CDNJS
- Automatic CDN deployment via NPM
- Version-specific URLs
- WASM binary accessibility

#### Custom CDN
- Self-hosted CDN for WASM files
- Geographic distribution
- Performance optimization

### 2. Browser Compatibility

#### Support Matrix
- Chrome/Chromium: 88+
- Firefox: 78+
- Safari: 14+
- Edge: 88+

#### Polyfills
- WebAssembly support detection
- Worker API fallbacks
- IndexedDB availability

### 3. Security Considerations

#### WASM Security
- Content Security Policy headers
- Subresource Integrity (SRI) for WASM files
- Secure worker initialization

#### Package Security
- Dependency vulnerability scanning
- Code signing
- Supply chain security

## Post-Release Monitoring

### 1. Analytics and Metrics

#### Usage Tracking
- Download statistics
- Version adoption rates
- Error reporting integration

#### Performance Monitoring
- WASM worker performance
- Bundle size impact
- Runtime error tracking

### 2. Support and Maintenance

#### Issue Management
- GitHub Issues for bug reports
- Feature request tracking
- Security vulnerability reporting

#### Documentation Maintenance
- API documentation updates
- Migration guides for breaking changes
- Troubleshooting guides

## Implementation Timeline

### Phase 1: Preparation (Week 1-2)
- [ ] Update package.json configuration
- [ ] Optimize build process
- [ ] Complete documentation
- [ ] Set up automated testing

### Phase 2: Beta Release (Week 3-4)
- [ ] Publish beta version
- [ ] Gather feedback from early adopters
- [ ] Fix critical issues
- [ ] Performance optimization

### Phase 3: Production Release (Week 5-6)
- [ ] Publish stable version
- [ ] Monitor deployment
- [ ] Address post-release issues
- [ ] Plan future releases

## Risk Mitigation

### 1. Technical Risks

#### WASM Compatibility
- **Risk**: Browser compatibility issues
- **Mitigation**: Comprehensive testing matrix, fallback strategies

#### Bundle Size
- **Risk**: Large package size affecting adoption
- **Mitigation**: Tree shaking, code splitting, lazy loading

### 2. Operational Risks

#### Build Failures
- **Risk**: Automated builds failing
- **Mitigation**: Robust CI/CD pipeline, manual override procedures

#### Security Vulnerabilities
- **Risk**: Vulnerabilities in dependencies or WASM code
- **Mitigation**: Regular security audits, automated vulnerability scanning

## Success Metrics

### 1. Adoption Metrics
- NPM download statistics
- GitHub star count
- Community contributions

### 2. Quality Metrics
- Issue resolution time
- Test coverage percentage
- Performance benchmarks

### 3. Developer Experience
- Documentation completeness
- API usability scores
- Support response time

## Conclusion

This plan provides a comprehensive approach to shipping the Web3Authn Passkey SDK as a production-ready NPM package. The key focus areas are:

1. **WASM Worker Distribution**: Ensuring proper bundling and runtime availability
2. **Build Process Reliability**: Automated, reproducible builds
3. **Documentation Quality**: Comprehensive guides and API documentation
4. **Post-Release Support**: Monitoring, maintenance, and community engagement

The success of this package depends on careful attention to the unique requirements of WASM-based cryptographic operations while maintaining the developer experience expected from modern JavaScript libraries.
