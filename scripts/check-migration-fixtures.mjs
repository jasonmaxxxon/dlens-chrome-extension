#!/usr/bin/env node
// MIGRATE gate: enforces that every entry in STORAGE_MIGRATIONS has paired
// `tests/fixtures/storage/<base>-v<from>.json` and `<base>-v<to>.json` fixtures,
// and that replaying the from fixture through `runMigrationsFor` produces the
// to fixture. The assertions live in `tests/check-migration-fixtures.test.ts`
// so they also run with the local suite; this script just delegates so CI gets
// a single `npm run` entry point that mirrors the seam-guard / boundary-guard
// pattern.

import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync(
  "npx",
  ["tsx", "--test", "tests/check-migration-fixtures.test.ts"],
  { stdio: "inherit" }
);

if (result.status === 0) {
  console.log("[migrate-fixtures] OK — every registered migration has paired fixtures and replays match.");
}

process.exit(result.status ?? 1);
