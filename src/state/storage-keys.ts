/**
 * Canonical chrome.storage.local key constants shared across the extension.
 *
 * `dlens:v0:` prefix is a historical artifact from before the storage schema
 * registry (`src/state/storage-schema.ts`) existed. Version evolution now lives
 * inside the JSON payload (`schemaVersion: <N>` field), not in the key name —
 * see the MIGRATE plan in `docs/handoff/2026-06-16-migrate-storage-schema-plan.md`.
 */
export const GLOBAL_STATE_STORAGE_KEY = "dlens:v0:global-state";
