import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { runMigrationsFor, STORAGE_MIGRATIONS } from "../src/state/storage-schema.ts";

/**
 * Maps each registered storage key to the fixture filename base used under
 * `tests/fixtures/storage/`. Every entry in STORAGE_MIGRATIONS must have an
 * entry here, and the corresponding `<base>-v<from>.json` + `<base>-v<to>.json`
 * files must exist. This mapping is the single source of truth that the CI
 * gate uses to detect "new migration added without fixture".
 */
const KEY_TO_FIXTURE_BASE: Record<string, string> = {
  "dlens:v0:global-state": "global-state",
  "dlens:v1:product-context": "product-context"
};

function fixtureUrl(name: string): URL {
  return new URL(`./fixtures/storage/${name}`, import.meta.url);
}

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(fixtureUrl(name), "utf8"));
}

test("every STORAGE_MIGRATIONS entry has an entry in KEY_TO_FIXTURE_BASE", () => {
  const mapped = new Set(Object.keys(KEY_TO_FIXTURE_BASE));
  const orphaned = STORAGE_MIGRATIONS.filter((m) => !mapped.has(m.key)).map((m) => m.key);
  assert.deepEqual(
    orphaned,
    [],
    `STORAGE_MIGRATIONS entries without a fixture base: ${JSON.stringify(orphaned)}. ` +
      "Add the key to KEY_TO_FIXTURE_BASE and create the paired fixtures."
  );
});

test("every STORAGE_MIGRATIONS entry has paired -v<from>.json and -v<to>.json fixtures", () => {
  for (const entry of STORAGE_MIGRATIONS) {
    const base = KEY_TO_FIXTURE_BASE[entry.key];
    if (!base) {
      continue; // covered by the previous test
    }
    const fromName = `${base}-v${entry.from}.json`;
    const toName = `${base}-v${entry.to}.json`;
    assert.ok(
      existsSync(fixtureUrl(fromName)),
      `missing fixture for migration ${entry.key} from=${entry.from}: ${fromName}`
    );
    assert.ok(
      existsSync(fixtureUrl(toName)),
      `missing fixture for migration ${entry.key} to=${entry.to}: ${toName}`
    );
  }
});

test("every STORAGE_MIGRATIONS entry replays its v<from> fixture into its v<to> fixture", () => {
  for (const entry of STORAGE_MIGRATIONS) {
    const base = KEY_TO_FIXTURE_BASE[entry.key];
    if (!base) {
      continue;
    }
    const fromName = `${base}-v${entry.from}.json`;
    const toName = `${base}-v${entry.to}.json`;
    const fromPayload = readFixture(fromName);
    const expected = readFixture(toName);
    const result = runMigrationsFor(STORAGE_MIGRATIONS, entry.key, fromPayload);
    assert.deepEqual(
      result,
      expected,
      `replay mismatch for ${entry.key} from=${entry.from}→to=${entry.to}: ` +
        `${fromName} → ${toName}`
    );
  }
});

test("every v<to> fixture declares schemaVersion equal to its `to` version", () => {
  for (const entry of STORAGE_MIGRATIONS) {
    const base = KEY_TO_FIXTURE_BASE[entry.key];
    if (!base) {
      continue;
    }
    const toName = `${base}-v${entry.to}.json`;
    const payload = readFixture(toName) as Record<string, unknown>;
    assert.equal(
      payload.schemaVersion,
      entry.to,
      `${toName} should declare schemaVersion: ${entry.to}`
    );
  }
});
