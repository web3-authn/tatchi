# SDK SRI Tarball (Local Builds)

This document describes the local‑only flow for building a deterministic SDK `.tar.gz` plus SRI metadata into a `./builds` directory in the repo. A separate service can then pick up these files and upload them to IPFS (or any other distribution channel) using the SRI hash for integrity.

There is **no GitHub Actions job** for this anymore; everything here runs locally (or in whatever environment calls the scripts).

## What Gets Built

From the current `sdk` package (version taken from `sdk/package.json`):

- Tarball: `builds/<version>/tatchi-sdk-<version>.tar.gz`
- Checksum: `builds/<version>/tatchi-sdk-<version>.tar.gz.sha256`
- SRI: `builds/<version>/tatchi-sdk-<version>.tar.gz.sri`

Tarball contents:

- `sdk/dist/**` (production build output)
- `sdk/package.json`
- `sdk/README.md`
- `sdk/LICENSE` (if present)

The SRI file contains a single `sha384-…` string suitable for Subresource Integrity (e.g., `<script integrity="sha384-…">`), derived from the tarball bytes.

## Prerequisites

- Repository dependencies installed: `pnpm install` at the repo root.
- SDK production build already run so that `sdk/dist` exists:
  - From repo root: `pnpm build:sdk-prod`
  - Or from `sdk/`: `pnpm build:prod`

The SRI tarball script **does not** build the SDK; it only packages the existing `sdk/dist` and computes integrity metadata.

## Commands

From the repo root:

```bash
# 1. Build SDK (once per version)
pnpm build:sdk-prod

# 2. Package tarball + SRI into ./builds
pnpm -C sdk build:sri-tarball
```

After step 2 you should see (for example, if `sdk/package.json` has `"version": "0.8.0"`):

- `builds/0.8.0/tatchi-sdk-0.8.0.tar.gz`
- `builds/0.8.0/tatchi-sdk-0.8.0.tar.gz.sha256`
- `builds/0.8.0/tatchi-sdk-0.8.0.tar.gz.sri`

The SRI value is also printed to stdout at the end of the script run.

## How a Downstream Service Can Use This

Given access to the repo checkout (or a volume with `builds`), a downstream automation can:

1. Locate the latest tarball by version (e.g., `builds/0.8.0/tatchi-sdk-0.8.0.tar.gz`).
2. Read `builds/0.8.0/tatchi-sdk-0.8.0.tar.gz.sri` to get the SRI string.
3. Optionally verify the tarball with:

   ```bash
   cd builds/0.8.0
   sha256sum -c tatchi-sdk-0.8.0.tar.gz.sha256
   ```

4. Upload the tarball to IPFS and store the mapping:
   - `version` → `IPFS CID`
   - `SRI (sha384-…)` → `IPFS CID` (or additional metadata row).

Because the tarball name and contents are version‑based, the process is repeatable and does not depend on GitHub Actions artifacts or Releases.
