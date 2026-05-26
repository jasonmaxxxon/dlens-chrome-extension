---
name: dlens-release-publish
description: Use when publishing a user-visible DLens Chrome extension release from /Users/tung/Desktop/dlens-product-latest, especially version bumps, docs/state sync, MV3 build verification, GitHub branch pushes, or "push main" requests.
---

# DLens Release Publish

## Purpose

Use this for release-style DLens work, not for ordinary feature edits. The goal is to make the source version, visible UI version, tests, built MV3 output, and GitHub branch truth match before telling the user the release is done.

## Source Of Truth

- Repo: `/Users/tung/Desktop/dlens-product-latest`
- Built unpacked extension: `/Users/tung/Desktop/dlens-product-latest/output/chrome-mv3`
- Reliable visible build check: `output/chrome-mv3/manifest.json`
- Version lock files:
  - `package.json`
  - `package-lock.json`
  - `wxt.config.ts`
  - `src/ui/version.ts`
  - `tests/manifest-config.test.ts`
  - `tests/components.test.tsx`

## Workflow

1. Audit the current checkout before editing or pushing.
   - Run `git status --short --branch`.
   - Run `git remote -v`.
   - If the worktree is dirty, identify which files belong to the requested release and do not revert unrelated user changes.
   - If the user asks to publish to `main`, verify whether `origin/main` can fast-forward from `HEAD`; do not force-push unless explicitly requested.

2. Apply the release version as one coherent lock.
   - Update all version lock files together.
   - Update version assertions in tests in the same pass.
   - Keep docs/state in sync when the release is user-visible:
     - `README.md`
     - `AGENTS.md`
     - `docs/memory/current-state.md`
     - any current release-state memory document the repo already uses

3. Verify the release locally.
   - Run:
     ```bash
     npm run typecheck
     npx tsx --test tests/*.test.ts tests/*.test.tsx
     npm run build
     git diff --check
     ```
   - Do not replace the full test command with `npx tsx --test tests`; that path has failed on this machine.

4. Verify the built MV3 output directly.
   - Confirm `output/chrome-mv3/manifest.json` exists.
   - Read the built manifest version and confirm it matches the intended release.
   - Check that build timestamps changed after `npm run build`.
   - If the user is testing Chrome load-unpacked, report `output/chrome-mv3` as the verified path.

5. Publish only to the intended branch.
   - Feature branch push: state the exact remote branch and upstream.
   - Main release push: prefer `git push origin HEAD:main` after verifying fast-forward safety.
   - After pushing, verify remote refs with `git ls-remote --heads origin main <branch>`.

## Failure Patterns

- If tests fail after a version bump, first check stale hard-coded version assertions in `tests/manifest-config.test.ts` and `tests/components.test.tsx`.
- If source files show the new version but Chrome does not, rerun `npm run build` and inspect `output/chrome-mv3/manifest.json`; source version is not enough.
- If the user says they cannot see the push on GitHub, explain whether the push went to a feature branch or `main`, then verify refs.
- If a release task also includes conceptual code slices, keep adjacent refactor/feature commits separate when the user requested that split.

## Stop Rule

Stop only when the requested branch has the intended commit, the full local verification passed or failures are clearly reported, and the built MV3 manifest matches the release version.
