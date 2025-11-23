#!/usr/bin/env bash

# Build an SDK tarball with SRI metadata into the repository-local ./builds directory.
# Another service can pick up these files and upload them to IPFS (or elsewhere),
# using the SRI hash for integrity checks.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SDK_DIR="${ROOT_DIR}/sdk"
BUILDS_DIR="${ROOT_DIR}/builds"

cd "$SDK_DIR"

if [ ! -d "dist" ]; then
  echo "sdk/dist not found."
  echo "Run 'pnpm build:sdk-prod' from the repo root (or 'pnpm -C sdk build:prod') first."
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
TARBALL_NAME="tatchi-sdk-${VERSION}.tar.gz"

VERSION_DIR="${BUILDS_DIR}/${VERSION}"
mkdir -p "$VERSION_DIR"

TARBALL_PATH="${VERSION_DIR}/${TARBALL_NAME}"
SHA256_PATH="${TARBALL_PATH}.sha256"
SRI_PATH="${TARBALL_PATH}.sri"

rm -f "$TARBALL_PATH" "$SHA256_PATH" "$SRI_PATH"

echo "📦 Packaging SDK dist for version ${VERSION} into ${TARBALL_PATH}..."

cd "$ROOT_DIR"
tar -czf "$TARBALL_PATH" \
  sdk/dist \
  sdk/package.json \
  sdk/README.md \
  $( [ -f sdk/LICENSE ] && echo sdk/LICENSE || true )

echo "🔐 Generating sha256 and SRI (sha384) for ${TARBALL_NAME}..."

cd "$VERSION_DIR"

sha256sum "$TARBALL_NAME" > "$SHA256_PATH"

INTEGRITY="$(openssl dgst -sha384 -binary "$TARBALL_NAME" | openssl base64 -A)"
echo "sha384-${INTEGRITY}" > "$SRI_PATH"

echo "✅ Built tarball and integrity metadata:"
echo "  - ${TARBALL_PATH}"
echo "  - ${SHA256_PATH}"
echo "  - ${SRI_PATH}"
echo ""
echo "SRI integrity string:"
cat "$SRI_PATH"
echo ""
