// Server-only defaults and helpers.
//
// Keep this separate from `sdk/src/core/defaultConfigs.ts` so browser bundles don't
// accidentally pull in server-oriented defaults/config.

// Threshold node roles.
// Coordinator is the default because it exposes the public `/threshold-ed25519/sign/*` endpoints.
export const THRESHOLD_NODE_ROLE_COORDINATOR = 'coordinator' as const;
export const THRESHOLD_NODE_ROLE_DEFAULT = THRESHOLD_NODE_ROLE_COORDINATOR;

// Threshold Ed25519 store defaults (Cloudflare Workers + Durable Objects).
export const THRESHOLD_ED25519_DO_OBJECT_NAME_DEFAULT = 'threshold-ed25519-store' as const;

// Default base prefix for threshold keyspaces when a host does not specify any prefix variables.
// This matches the SDK's legacy prefix defaults (w3a:threshold-ed25519:*).
export const THRESHOLD_PREFIX_DEFAULT = 'w3a' as const;

// Safe default: do not require a master secret. When a master secret is provided, `auto` will
// still select derived relayer share mode.
export const THRESHOLD_ED25519_SHARE_MODE_DEFAULT = 'auto' as const;
