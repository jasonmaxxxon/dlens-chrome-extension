# DLens Extension v0 Agent Handoff

Last updated: 2026-03-25 (Asia/Hong_Kong)

## 1. What DLens Is Trying To Become

DLens is no longer being treated as "just a crawler" or "just a dashboard."

The intended product direction is:

- help an analyst or researcher scan Threads quickly
- collect posts into named containers
- queue crawl jobs against those posts
- later run lightweight single-post or cross-post analysis on organized collections

The important shift is:

- **from**: a vague single-post intelligence product or generic dashboard
- **to**: an analyst-facing capture and organization tool, with ingestion behind it and analysis layered later

The browser capture surface is now treated as the acquisition seam.

## 2. Original DLens Ambition

Before the current extension focus, the broader DLens idea included:

- comment clustering
- evidence-oriented summaries
- topic / branch / stance style analysis
- single-post and cross-post comparison
- reuse of older `dlens_26` analysis assets rather than rebuilding them from scratch

That broader intelligence ambition is **not dead**. It is just **not in scope for extension v0/v0.2.x**.

Current architectural thinking is:

- capture in the extension
- ingestion in `dlens-ingest-core`
- future analysis through an adapter layer that can reuse `dlens_26`

## 3. Target Users / Customers

The current working user is:

- an analyst
- an investigator
- a researcher
- someone tracking several Threads topics at once and manually saving interesting posts

This is **not** optimized for a casual social user.
It is meant for someone who is scanning feed pages repeatedly and wants an instrument-panel-like tool beside the feed.

## 4. Why The Product Direction Pivoted

The pivot happened because the old shape risked becoming too diffuse:

- too much dashboard thinking
- too much analysis before reliable capture
- too much ambiguity about where trustworthy inputs come from

The current bet is:

- if capture is unstable, everything above it is fake confidence
- if capture is stable, future queueing, comparison, and analysis have a trustworthy base

So v0 is about making the input seam real, deterministic enough, and pleasant enough to use repeatedly.

## 5. Related Repos And Their Roles

### `/Users/tung/Desktop/dlens-chrome-extension-v0`

This repo is the real MV3 extension shell and current working product surface.

### `/Users/tung/Desktop/dlens_chrome_extension_branch`

This repo is the canonical browser-side targeting prototype.

Rules:

- it is page-side targeting prototype work only
- it is locked to Playwright prototype work
- do not build extension packaging, API, DB, or side panel work there

### `/Users/tung/Desktop/dlens-ingest-core`

This repo is the ingestion heart.

It owns:

- `POST /capture-target`
- `GET /jobs/{job_id}`
- `GET /captures/{capture_id}`
- queue state
- worker claim / retry / lease / result persistence

### `dlens_26`

This is the older analysis-heavy codebase with reusable ideas/assets for:

- clustering
- preanalysis
- evidence-first summary shapes

Current direction is to **reuse** those later, not rebuild them inside `dlens-chrome-extension-v0`.

## 6. Locked Scope For `dlens-chrome-extension-v0`

Still in scope:

- Threads feed + post-detail capture
- local folder organization
- save selected post targets
- queue to ingest-core
- status refresh
- show raw deterministic comment previews only after crawl success

Still out of scope:

- Supabase or direct DB logic
- worker implementation
- dashboard / SaaS homepage
- topic / branch / stance UI
- compare UI
- API key settings
- raw analysis rendering
- a second independent Threads parser

## 7. Current Product Shape

The current intended shape is:

- **Feed** = sensing + targeting + immediate confirmation
- **Right-side panel** = control + organization + queue management
- **Background** = network owner
- **Ingest core** = source of truth for crawl/result state

This was an explicit design decision.

The panel is allowed to be central **as an instrument panel**, but the feed must still provide the first layer of interaction feedback.

## 8. Current Code Progress

As of this handoff, `dlens-chrome-extension-v0` has:

### Working foundations

- WXT + React + TypeScript extension shell
- Threads content script running on feed and post-detail pages
- background script as the only network owner
- local persistent folder storage in `chrome.storage.local`
- integration with ingest-core submit + status refresh
- debug side panel still present as fallback

### Implemented product behaviors

- in-page launcher
- right-side popup / instrument panel
- `Collect / Library / Settings` tabs
- collect mode
- hover preview and panel preview
- save current preview into a folder
- optimistic save toast / optimistic queued state
- library list-first UI
- queue `this` / `all`
- folder create / rename / delete
- deterministic raw comments after crawl success

### Selector and targeting work already done

- soft-candidate scoring instead of naive hard fallback
- composer / recommendation / feed-shell rejection
- lighter overlay styling
- cursor + collect-mode banner
- quoted/repost outer-card eligibility improved

### Recent v0.2.1 patch highlights

- panel preview now prefers hover/flash preview rather than waiting for save
- engagement row uses outline icons
- 4th engagement icon was switched from `views` to `forwards`
- folder item counts are visible in the selector
- delete-folder fallback resets active folder correctly

## 9. Important Files

### Core entrypoints

- `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/threads.content.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/background.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/entrypoints/sidepanel/main.tsx`

### Key UI files

- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/InPageCollectorApp.tsx`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/SidepanelApp.tsx`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/ui/controller.tsx`

### State / messages / storage helpers

- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/types.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/messages.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/ui-state.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/store-helpers.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/state/comment-preview.ts`

### Targeting logic

- `/Users/tung/Desktop/dlens-chrome-extension-v0/src/targeting/threads.ts`

### Existing tests

- `/Users/tung/Desktop/dlens-chrome-extension-v0/tests/comment-preview.test.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/tests/selection-mode-messages.test.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/tests/session-model.test.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/tests/store-helpers.test.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/tests/ui-state.test.ts`
- `/Users/tung/Desktop/dlens-chrome-extension-v0/tests/targeting.test.ts`

## 10. Current Known Problems / Risks

These are **still active** and should be assumed unresolved until manually rechecked:

1. Repost / quoted-post targeting is improved but still needs real feed verification
2. Hover preview timing may still need tuning for perceived smoothness
3. Collect outline is lighter now, but visual polish can still improve
4. Some Threads feed structures are structurally weird; selector confidence is improved, not "solved forever"
5. Folder / preview / hover state sync should be manually regression tested after any targeting change

## 11. What Was Explicitly Rejected

The user has explicitly rejected these directions for now:

- turning the extension into a dashboard first
- over-expanding into analysis UI too early
- exposing lease details in main UI semantics
- purple/"AI tool" visual tone
- relying on `views` as the 4th main engagement metric in feed capture mode

The user does want:

- deep-sea blue, precise, tool-like visual language
- Apple-like smoothness
- a panel that feels like a useful side instrument panel
- capture accuracy first

## 12. Preferred Product Vocabulary

Use:

- `Folder`
- `Save to folder`
- `Queue this`
- `Queue all`

Avoid user-facing:

- `Session`
- generic "analysis" language in the extension
- `key comments` or semantic labels that imply intelligence not actually implemented

## 13. Current Verification Commands

From `/Users/tung/Desktop/dlens-chrome-extension-v0`:

```bash
npm run build
npm run typecheck
node --experimental-strip-types --test tests/*.test.ts
```

The latest local pass status before this handoff:

- `npm run build` passed
- `npm run typecheck` passed
- `node --experimental-strip-types --test tests/*.test.ts` passed

## 14. Manual Test Flow To Resume With

1. Build extension
2. Reload in `chrome://extensions`
3. Refresh a Threads feed page
4. Enter collect mode
5. Hover a normal post
6. Hover a repost / quoted post
7. Confirm:
   - correct card boundary
   - hover flash preview
   - panel preview updates on hover
   - `S` saves immediately
   - `Esc` exits collect mode
   - forwards icon is used instead of views
8. Save into multiple folders
9. Rename/delete folders
10. Queue one / queue all

## 15. Current Environment / Tooling Notes

### Repo status

`/Users/tung/Desktop/dlens-chrome-extension-v0` is currently **not a git repository**.

Do not assume:

- branch history
- clean working tree
- `git diff`

### Installed / available Codex skills in this environment

Relevant skills already available:

- `brainstorming`
- `test-driven-development`
- `systematic-debugging`
- `verification-before-completion`
- `ui-ux-pro-max`
- `playwright`
- `requesting-code-review`
- `receiving-code-review`
- `writing-plans`
- `executing-plans`
- `subagent-driven-development`

Other available skills in this environment include:

- `defuddle`
- `dispatching-parallel-agents`
- `finishing-a-development-branch`
- `gh-address-comments`
- `gh-fix-ci`
- `json-canvas`
- `obsidian-bases`
- `obsidian-cli`
- `obsidian-markdown`
- `openai-docs`
- `pdf`
- `security-best-practices`
- `security-threat-model`
- `using-git-worktrees`
- `using-superpowers`
- `writing-skills`
- `skill-creator`
- `skill-installer`

### Extra note on Figma

Figma MCP was investigated but is not currently part of the reliable working path for this repo handoff. Do not assume Figma context is available.

### Extra note on UI skill

`ui-ux-pro-max` was explicitly installed and is useful for:

- interaction polish
- state clarity
- icon/style consistency
- tool-like instrument panel refinement

## 16. Best Next Steps For A New Agent

If another agent resumes now, the recommended order is:

1. Manually retest repost / quoted-post capture on real Threads feed pages
2. If targeting still fails, continue refining `/src/targeting/threads.ts`
3. If targeting feels correct, polish overlay geometry and hover preview timing
4. Keep analysis / compare out of scope
5. Do not open a new dashboard track inside this repo

## 17. One-Sentence Product North Star

Build a Threads capture tool that feels fast, precise, and trustworthy enough for an analyst to keep open while scanning multiple topics and saving posts into organized folders for later crawl and analysis.
