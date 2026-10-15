/**
 * Canonical chrome.storage.local key constants shared across the extension.
 *
 * `dlens:v0:` prefix is a historical artifact from before the storage schema
 * registry (`src/state/storage-schema.ts`) existed. Version evolution now lives
 * inside the JSON payload (`schemaVersion: <N>` field), not in the key name —
 * see the MIGRATE plan in `docs/handoff/2026-06-16-migrate-storage-schema-plan.md`.
 */
export const GLOBAL_STATE_STORAGE_KEY = "dlens:v0:global-state";

/**
 * Schema version a freshly written payload carries. Must equal the highest
 * `to` in STORAGE_MIGRATIONS for the global-state key, or every startup
 * re-migrates state that is already current.
 *
 * It lives here, in the leaf module, so `createEmptyGlobalState` in
 * `./types.ts` can read it without importing the migration registry (which
 * reaches back into `src/compare/product-context.ts` and from there into
 * `./types.ts`). `storage-schema.ts` re-exports it for existing callers.
 */
export const CURRENT_STORAGE_SCHEMA_VERSION = 3;
