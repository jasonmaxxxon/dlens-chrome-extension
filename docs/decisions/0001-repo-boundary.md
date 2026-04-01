# Decision 0001: Repo Boundary

## Status

Accepted

## Context

DLens now has:

- a stable ingestion heart in `/Users/tung/Desktop/dlens-ingest-core`
- a stable page-side targeting prototype in `/Users/tung/Desktop/dlens_chrome_extension_branch`

The missing piece is a real extension shell that lets a user select and submit Threads targets without manual API calls.

## Decision

`dlens-chrome-extension-v0` will be the extension shell MVP only.

It will:

- run as a Chrome MV3 extension
- support Threads feed and post-detail pages
- host a sidebar
- derive browser-side target descriptors
- submit to ingest-core through background-owned network calls
- poll queue status and show a minimal operator-facing state

It will not:

- do backend, DB, or worker logic
- show raw crawl JSON
- implement intelligence objects
- implement dashboard or SaaS surfaces
- rewrite Threads parsing heuristics

## Consequences

- the repo stays small and focused
- backend iteration remains in `dlens-ingest-core`
- browser-side heuristic iteration remains anchored to the prototype and fetcher family
- extension UX can evolve without contaminating backend scope
