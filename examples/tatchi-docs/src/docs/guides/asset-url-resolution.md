---
title: Asset URL Resolution
---

# Asset URL Resolution

Notes on serving SDK assets (`/sdk/*`), WASM MIME types, and stable paths across dev/prod. Full guide to be migrated from MDX.

Checklist
- Serve `/sdk/*` under a stable base path in dev and prod
- Ensure `.wasm` uses `application/wasm` MIME
- Keep absolute imports consistent between app and wallet origin

