# Task 8 Report — 0.3.49 Release Metadata and Static Gate

## Release scope

- Bumped all five version locks to `0.3.49` without changing production behavior or bundle limits.
- Updated branch-neutral release documentation for Topic session envelope resilience: persisted run ownership and renewable leases, classified/typed semantic retry, Google `x-goog-api-key` transport, one owner session card plus folder-scoped status rail, and review fixes.
- Runtime status is deliberately bounded: source/build `0.3.49` is static-ready, but Default Chrome reload/manual acceptance was not run because the owner explicitly required skipping Chrome/CDP. The release is not runtime-green.
- Repository state is local-only; no push or tag was performed.

## Pre-metadata evidence supplied by the main agent

- Full implementation review: CLEAN; all findings resolved; spec compliance Yes.
- Fresh implementation gate: 1289 total / 1284 pass / 0 fail / 5 skipped.
- Typecheck, both boundary guards, storage seam guard, migration fixtures, fixture harness, production build, bundle guard, and `git diff --check`: PASS.
- Pre-version final bundle: 909846 raw / 255006 gzip -9 / 202909 brotli bytes against unchanged limits 910000 / 256000 / 203000.

## Metadata commands

```bash
npm version 0.3.49 --no-git-tag-version
```

Result: `v0.3.49`; this command updated `package.json` and `package-lock.json`. `apply_patch` updated `wxt.config.ts`, `src/ui/version.ts`, and `tests/manifest-config.test.ts` to the same version.

Initial post-version measurement:

```bash
npm run build
npm run bundle:guard
```

Result: PASS — 909846 raw / 255007 gzip -9 / 202909 brotli bytes. No fixed limit changed.

## Fresh 0.3.49 release gate

Commands:

```bash
npm run typecheck
npm run boundary:guard
npm run storage:seam-guard
npm run storage:migrate-fixtures
npx tsx --test tests/*.test.ts tests/*.test.tsx
npm run qa:harness:fixture
npm run build
npm run bundle:guard
node --input-type=module -e 'import { readFileSync } from "node:fs"; for (const path of [".output/chrome-mv3/manifest.json", "output/chrome-mv3/manifest.json"]) { const manifest = JSON.parse(readFileSync(path, "utf8")); if (manifest.version !== "0.3.49" || manifest.name !== "DLens v3") throw new Error(`${path}: ${manifest.name} ${manifest.version}`); console.log(`${path}: ${manifest.name} ${manifest.version}`); }'
git diff --check
```

Results:

- `npm run typecheck`: PASS (`tsc --noEmit`, exit 0).
- `npm run boundary:guard`: PASS; View and ViewModel guards report zero violations and zero allowlisted bypasses.
- `npm run storage:seam-guard`: PASS; zero unauthorized writes and zero allowlisted bypasses.
- `npm run storage:migrate-fixtures`: PASS; 4/4 fixture-guard tests.
- Full test suite: 1289 total / 1284 pass / 0 fail / 5 skipped.
- `npm run qa:harness:fixture`: PASS; all required phases reached, terminal `ui.ready` reached, no pipeline error.
- `npm run build`: PASS; production Chrome MV3 build mirrored to `output/chrome-mv3`.
- `npm run bundle:guard`: PASS — 909846 raw / 255007 gzip -9 / 202909 brotli bytes.
- Bundle headroom under unchanged limits: 154 raw / 993 gzip -9 / 91 brotli bytes.
- `.output/chrome-mv3/manifest.json`: `DLens v3 0.3.49`.
- `output/chrome-mv3/manifest.json`: `DLens v3 0.3.49`.
- `git diff --check`: PASS (exit 0, no output).

## Version lock evidence

- `package.json`: `0.3.49`
- `package-lock.json` root version: `0.3.49`
- `package-lock.json` root package version: `0.3.49`
- `wxt.config.ts` `manifest.version`: `0.3.49`
- `src/ui/version.ts` `BUILD_VERSION`: `0.3.49`
- `tests/manifest-config.test.ts` expected version: `0.3.49`

## Runtime and publication boundary

- Static/source/build status: ready at `0.3.49`.
- Default Chrome reload/manual acceptance: not executed by explicit owner instruction to skip Chrome/CDP.
- Runtime-green claim: not made.
- Remote state: local-only, not pushed, not tagged.
