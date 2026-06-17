# Threads extraction — cross-layer report

Date: 2026-06-17 (rich-thread capture-derived)
Inputs:
- Extension descriptor: `src/targeting/threads.ts:findCardCandidate` + `buildTargetDescriptor` replayed against `tests/fixtures/threads/descriptor/rich-thread.html` (this repo).
- Backend structured harvest: `_harvest_cards_structured` output saved to `tests/crawlers/fixtures/threads/rich-thread/structured_cards.json` (`dlens-ingest-core`).
- Backend parser: `vendor/parser.py:extract_data_from_html` output saved to `tests/crawlers/fixtures/threads/rich-thread/parsed.json` (`dlens-ingest-core`).
- Backend normalized read model: `normalize_threads_result` projection (re-derived from `parsed.json` + `manifest.json` per `crawlers/threads/normalize.py`).

Status: Phase B closure for the threads-extraction-crawler audit plan. Single-capture (op-post + 5 OP self-replies + 1 pinned CTA card). Feeds Phase C risk-register decisions.

## Why this report exists

The audit's F10 finding said three independent DOM heuristic layers
(extension descriptor / backend structured harvest / backend parser)
each interpret Threads cards on their own, and a regression in any
one can silently produce a "successful" capture that disagrees with
the other two layers. Phase A's `call-graph` doc named the
boundaries; Phase B captured one rich thread offline; this report
joins the three layers' outputs against the same source so future
PRs can target the layer where divergence actually lives.

The single rich-thread fixture covers 3 of the 7 audit labels
(`op-post`, `op-continuation-chain`, `thread-with-expanded-replies`).
The remaining 4 labels (plus the backend-only F4 collision label)
await separate authorized captures per
`tests/crawlers/fixtures/threads/LABEL_COVERAGE.md` in
`dlens-ingest-core`.

## Cards present in the rich-thread fixture

7 pressable cards on the page:

| # | Post id | Author per parser | Body head |
| --- | --- | --- | --- |
| 1 | `DZpehhuAdCe` (OP) | aiposthub | 把 Hermes Agent 部署到雲端... |
| 2 | `DZpeh3tAYBq` | aiposthub | 筆電蓋起來... |
| 3 | `DZpeiZ-AQxV` | aiposthub | 但有些人的 Agent... |
| 4 | `DZpei-QgSEf` | aiposthub | 這堂會從 Oracle Cloud 免費帳號開始... |
| 5 | `DZpejaiAZiD` | aiposthub | 這次會示範三個實戰場景... |
| 6 | `DZpej-UgaLJ` | aiposthub | 如果你已經感覺到... |
| 7 | `DZpemmEAXXI` | (Pin icon — CTA card) | · Author 別錯過了報名以下... |

Cards 2–6 form an OP-continuation chain (proven by
`inline_reply_edges.json` linking them as parent→child). Card 7 is a
pinned promotional card with no body author handle.

## Cross-layer comparison per card

The four columns capture what each layer says about the same card.
Cells named **NULL** mean "the layer did not surface this field"; **MATCH**
means "agrees with the other populated cells for the same field".

### Card 1 — OP (`DZpehhuAdCe`)

| Field | Extension descriptor | Backend structured card | Backend parser (`post`) | Backend normalized (canonical_post) |
| --- | --- | --- | --- | --- |
| author | aiposthub | NULL (empty `user` field) | aiposthub | aiposthub |
| post_id | implicit in post_url | NULL | `DZpehhuAdCe` | `DZpehhuAdCe` |
| body text head | `aiposthubVerified17hMore把 Hermes Agent 部署到雲端…` (includes UI noise prefix) | `把 Hermes Agent 部署到雲端...` (clean) | `把 Hermes Agent 部署到雲端...` (clean) | MATCH parser |
| engagement.likes | 137 | 137 (in metrics block) | 137 (in `post.metrics`) | MATCH |
| engagement.comments | 13 | 13 | 13 | MATCH |
| engagement.reposts | 8 | 8 | 8 | MATCH |
| engagement.forwards | 38 | 38 | 38 | MATCH |
| engagement_source | `card` | n/a | n/a | n/a |
| time_token | (empty — JSDOM regex boundary issue around "17h") | `17h` | `17h` | n/a |

Observations:

- **Layer divergence on author** — backend structured harvest leaves
  the OP card's `user` field empty even though the parser layer
  correctly attributes it to `aiposthub`. The structured harvest is
  apparently picking the OP-card timestamp anchor (whose visible
  text is the time, not a handle) instead of the author profile
  link. Phase D candidate: align structured-harvest author resolution
  with the parser's logic, or drop `user` from structured cards if
  downstream code never reads it.
- **Layer divergence on body text head** — extension descriptor
  contaminates `text_snippet` with UI tokens (`aiposthubVerified17hMore`)
  the parser strips. `cleanBodyText` in
  `src/targeting/threads.ts` doesn't catch the multi-token prefix.
  Phase D candidate: extend the UI-token filter or share
  `_strip_ui_headers` logic with the backend.
- **Time-token loss in extension** — `time_token_hint` is empty in
  the descriptor even though the same `"17h"` text is present in
  the card. The regex `\b\d+\s*[smhdw]\b` doesn't fire because
  "Verified17h" has no word boundary. Backend parser sees `"17h"`
  correctly. Phase D candidate: relax the regex or pre-tokenize.

### Card 2 — OP self-reply (`DZpeh3tAYBq`, first link of OP-continuation chain)

| Field | Extension descriptor | Backend structured card | Backend parser (comment[0]) | Backend normalized (comments[0]) |
| --- | --- | --- | --- | --- |
| target_type | `comment` (URL ≠ page URL) | n/a | n/a | n/a |
| post_url | `https://www.threads.net/@aiposthub/post/DZpeh3tAYBq` | permalink `/@aiposthub/post/DZpeh3tAYBq` | parsed from anchor | n/a |
| author | aiposthub | NULL | aiposthub | aiposthub |
| body text head | `aiposthubVerified17hMore筆電蓋起來…` | `筆電蓋起來...` | `筆電蓋起來...` | MATCH parser |
| engagement.likes | 5 | 5 | 5 | MATCH |
| engagement.comments | 1 | 1 | 1 | MATCH |
| engagement_source | `card` | n/a | n/a | n/a |

Observations:

- Same author-attribution gap on the structured-harvest layer.
- Same body-prefix UI noise on the extension descriptor.

### Cards 3–6 — remaining OP-continuation chain

All four cards (`DZpeiZ-AQxV`, `DZpei-QgSEf`, `DZpejaiAZiD`,
`DZpej-UgaLJ`) repeat the same shape as Card 2: parser surfaces
author `aiposthub` and clean body text; structured-harvest layer
loses the `user` field. The OP-continuation chain is therefore
robust on the parser-and-normalize side (read model correctly
clusters these under `op_continuations`) and accidentally robust on
the extension side (because both `extractAuthorHint` and the
parser converge on `aiposthub` even though they reach it through
different anchors).

### Card 7 — pinned CTA (`DZpemmEAXXI`)

| Field | Extension descriptor | Backend structured card | Backend parser (comment[5]) | Backend normalized |
| --- | --- | --- | --- | --- |
| author | (not asserted in replay) | empty | `Pin icon` | `Pin icon` |
| body head | n/a | `· Author 別錯過了報名以下...` | `別錯過了報名以下` | MATCH parser |
| permalink | n/a | `/@aiposthub/post/DZpemmEAXXI` | n/a | n/a |

Observations:

- **Parser names the author `Pin icon`** — clearly a UI token, not
  a real author. The structured harvester correctly leaves `user`
  empty for this card. Phase D candidate: parser should detect the
  pinned-card shape (the `· Author` prefix in the body) and either
  drop the row or attribute it to the post's author. As-is, this
  garbage row makes it into `normalized.comments` and the read
  model.

## Layer-level patterns

Generalizing across the seven cards:

| Layer | Strength | Weakness exposed by rich-thread |
| --- | --- | --- |
| Extension descriptor (`src/targeting/threads.ts`) | Engagement extraction agrees with parser on every numeric metric. `engagement_source` correctly flags `card` for both OP and replies. | `text_snippet` prefix is contaminated with UI tokens. `time_token_hint` regex fails on "Verified17h"-style runs. F2 wrong-author behavior surfaces when the hover starting point is the permalink anchor rather than the body text. |
| Backend structured harvest (`_harvest_cards_structured`) | Card boundaries are clean; permalink and body text are correct on every card. | `user` field is empty on every card in this fixture — author resolution is broken for the OP / OP-continuation shape. |
| Backend parser (`vendor/parser.py:extract_data_from_html`) | Authors correctly resolved across the OP chain. Metrics agree with structured harvest. | Pinned CTA card mis-attributed as author `Pin icon`. UI noise visible in some text_raw fields (filtered downstream). |
| Backend normalized read model (`normalize_threads_result` + `build_thread_read_model`) | OP-continuation chain detection works (all 5 self-replies surface under `op_continuations`). Reply edges + orphan replies derive correctly. | Inherits the parser's `Pin icon` author row. No defense against pinned-CTA garbage. |

## Phase C inputs

This report is the evidence base PR 6 (the risk register) draws from.
Single-fixture caveat: every pattern above is one data point. A
direct-reply fixture would test whether the structured harvester
recovers `user` for non-OP authors (currently unknown). A repost or
quoted-post fixture would probe the F2 heuristic on the harder
cases the audit named. The risk register treats every "Phase D
candidate" above as a hypothesis until a multi-fixture replay
confirms or rejects it.

The cross-layer report is not a tool — it is a static document
captured at one moment from one thread. Re-running this analysis
when new fixtures land means re-reading the four artifact sets and
updating the tables.
