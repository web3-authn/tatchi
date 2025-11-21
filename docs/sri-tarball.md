# SDK Tarball + SRI Plan

This document captures a concrete plan for a dedicated GitHub Actions workflow that builds the SDK, packages the build output as a `.tar.gz`, and attaches integrity metadata (hashes + SRI string). It should be incremental and re‑use the existing `deploy-cloudflare` build shape as much as possible.

## Goals

- Produce a reproducible, versioned `@tatchi-xyz/sdk` build as a `.tar.gz` artifact.
- Keep the build environment identical (or very close) to `deploy-cloudflare.yml`.
- Emit integrity metadata (sha256 and SRI `sha384-…` string) for the tarball.
- Optionally verify the tarball against its checksum/SRI in CI.
- Avoid new secrets; rely only on public GitHub Actions and repository contents.

Non‑goals:

- Publishing to npm (covered separately).
- Changing the existing Cloudflare deploy pipeline.

## Target Artifact Layout

Tarball contents (initial proposal):

- Root: `sdk/`
  - `sdk/dist/**` (current production build output)
  - `sdk/package.json`
  - `sdk/README.md`
  - `sdk/LICENSE` (if present)
  - `sdk/dist/manifest.json` and `sdk/dist/manifest.sig` (when present from `deploy-cloudflare`‑style build)

Artifact files uploaded by the workflow:

- `sdk-dist-${GITHUB_SHA}.tar.gz`
- `sdk-dist-${GITHUB_SHA}.tar.gz.sha256` (plain sha256sum line)
- `sdk-dist-${GITHUB_SHA}.tar.gz.sri` (single `sha384-…` line suitable for SRI)

## New Workflow Skeleton

Add a new workflow file at `.github/workflows/sdk-tarball.yml` with:

- `name: sdk-tarball`
- `on`:
  - `workflow_dispatch` (manual runs)
  - `push` with `tags: ['v*']` (publish per release tag)

Single job for now:

- `jobs.build-tarball`:
  - `runs-on: ubuntu-latest`
  - Steps (mirroring `deploy-cloudflare.yml`):
    - Checkout (`actions/checkout@v4`, `fetch-depth: 0`).
    - Setup pnpm (`pnpm/action-setup@v3`, `version: 9`).
    - Setup Node (`actions/setup-node@v4`, `node-version: '20'`, `cache: 'pnpm'`).
    - Install Rust toolchain (`dtolnay/rust-toolchain@stable`).
    - Add wasm target (`rustup target add wasm32-unknown-unknown`).
    - Install wasm-pack (same curl installer as `deploy-cloudflare`).
    - Setup Bun (`oven-sh/setup-bun@v2`).
    - Install deps: `pnpm install --no-frozen-lockfile`.
    - Build SDK: `pnpm build:sdk-prod`.

Packaging step (example shell):

```yaml
      - name: Package sdk/dist as tarball
        run: |
          set -euxo pipefail
          mkdir -p artifacts
          TARBALL="sdk-dist-${GITHUB_SHA}.tar.gz"
          # include dist, package.json, README, LICENSE if present
          tar -czf "artifacts/$TARBALL" \
            -C sdk dist \
            -C .. sdk/package.json sdk/README.md $( [ -f sdk/LICENSE ] && echo sdk/LICENSE || true )
```

Upload artifact:

```yaml
      - name: Upload tarball and hashes
        uses: actions/upload-artifact@v4
        with:
          name: sdk-dist-${{ github.sha }}
          path: artifacts/**
```

## SRI Metadata Generation

After the tarball is created, generate both sha256 and SRI‑compatible sha384 hashes:

```yaml
      - name: Generate checksums and SRI string
        run: |
          set -euxo pipefail
          cd artifacts
          TARBALL=$(ls sdk-dist-*.tar.gz)

          # 1) sha256 manifest (simple to verify with sha256sum -c)
          sha256sum "$TARBALL" > "$TARBALL.sha256"

          # 2) SRI-style sha384 (base64 of raw digest, prefixed with "sha384-")
          INTEGRITY=$(openssl dgst -sha384 -binary "$TARBALL" | openssl base64 -A)
          echo "sha384-$INTEGRITY" > "$TARBALL.sri"
```

Notes:

- The `.sha256` file is convenient for CLI verification (`sha256sum -c`).
- The `.sri` file can be surfaced in docs as a copy‑paste `integrity` value for any consumers that load the tarball via `<script>` or similar (if applicable).

## Optional: CI SRI / Checksum Verification

If we want CI to verify the tarball against its own checksums (to guard against any later processing step), add a short self‑check job or step:

- In the same `build-tarball` job, immediately verify:

```yaml
      - name: Self-check tarball checksum
        run: |
          set -euxo pipefail
          cd artifacts
          sha256sum -c *.tar.gz.sha256
```

- This confirms that the tarball written to disk still matches the checksum file (defense in depth; mainly useful if later steps move/copy files).

If stronger guarantees are desired:

- Reuse the existing `manifest.json` + `manifest.sig` flow:
  - Generate `sdk/dist/manifest.sha256` / `manifest.json` as in `deploy-cloudflare.yml`.
  - Sign the manifest with `cosign sign-blob` and include both `manifest.json` and `manifest.sig` in the tarball.
  - Optionally, add a CI step that runs `cosign verify-blob` on the manifest before packaging to ensure only signed contents are included.

## Optional: Release Asset Publishing

To attach the tarball to GitHub Releases:

- Add a second job `publish-release-asset`:
  - `needs: build-tarball`
  - `if: startsWith(github.ref, 'refs/tags/')`
  - Steps:
    - Download artifact (`actions/download-artifact@v4`).
    - Use `softprops/action-gh-release@v2` (or similar) to attach:
      - `sdk-dist-${GITHUB_SHA}.tar.gz`
      - `sdk-dist-${GITHUB_SHA}.tar.gz.sha256`
      - `sdk-dist-${GITHUB_SHA}.tar.gz.sri`

This keeps the SRI/sha256 metadata colocated with the tarball at the release boundary.

## Open Questions / Decisions

- Exact tarball contents:
  - Is `sdk/dist/** + package.json + README + LICENSE` sufficient, or should we include additional metadata (e.g., `CHANGELOG`, docs snapshot)?
- Trigger conditions:
  - Tags only, or also `main` pushes (for nightly tarballs)?
- SRI surface:
  - Do downstream consumers actually load the tarball via `<script>`/`<link>` (SRI‑style), or is sha256/`cosign`‑style verification enough?

Once these are decided, implement `.github/workflows/sdk-tarball.yml` according to this plan and add a short doc link from relevant deployment docs (e.g., `docs/deployment/release.md`).

