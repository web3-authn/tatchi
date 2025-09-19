#!/bin/bash

# Check if built SDK files are newer than source files
# This prevents tests from importing stale versions

set -e

# Source centralized build configuration
source "$(dirname "$0")/../build-paths.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if dist directory exists
if [ ! -d "$BUILD_ROOT" ]; then
    echo -e "${RED}❌ Build directory '$BUILD_ROOT' does not exist${NC}"
    exit 1
fi

# Check if key built files exist
if [ ! -f "$BUILD_WORKERS/$WORKER_SIGNER" ] || [ ! -f "$BUILD_WORKERS/$WORKER_VRF" ]; then
    echo -e "${RED}❌ Required worker files not found in $BUILD_WORKERS${NC}"
    exit 1
fi

# Get modification time of dist directory (when build was last completed)
DIST_TIME=$(stat -f %m "$BUILD_ROOT" 2>/dev/null || stat -c %Y "$BUILD_ROOT" 2>/dev/null || echo "0")

# Check if any source files are newer than the build
STALE_BUILD=false
STALE_FILES=()

# Check critical directories
for dir in "${CRITICAL_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        while IFS= read -r -d '' file; do
            if [ -f "$file" ]; then
                FILE_TIME=$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo "0")
                if [ "$FILE_TIME" -gt "$DIST_TIME" ]; then
                    STALE_BUILD=true
                    STALE_FILES+=("$file")
                fi
            fi
        done < <(find "$dir" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.rs" -o -name "*.toml" \) -print0)
    fi
done

# Check critical files
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        FILE_TIME=$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo "0")
        if [ "$FILE_TIME" -gt "$DIST_TIME" ]; then
            STALE_BUILD=true
            STALE_FILES+=("$file")
        fi
    fi
done

# Report results
if [ "$STALE_BUILD" = true ]; then
    echo -e "${RED}❌ Build is stale${NC}"
    echo -e "${YELLOW}Files newer than build:${NC}"
    for file in "${STALE_FILES[@]}"; do
        echo -e "  - $file"
    done
    exit 1
else
    echo -e "${GREEN}✅ Build is fresh${NC}"
    exit 0
fi