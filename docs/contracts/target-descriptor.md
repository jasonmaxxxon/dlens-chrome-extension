# Target Descriptor Contract

`TargetDescriptor` is the canonical browser-side selection object inside the extension.

It is derived from the prototype heuristics in:

- `/Users/tung/Desktop/dlens_chrome_extension_branch/scripts/threads_targeting_prototype.js`

## Fields

- `target_type`
  - `post` or `comment`
- `page_url`
  - normalized current page URL
- `post_url`
  - normalized thread post URL when available
- `author_hint`
  - best-effort author handle
- `text_snippet`
  - short cleaned body text snippet
- `time_token_hint`
  - best-effort time token such as `2h`
- `dom_anchor`
  - DOM path-like locator for debugging
- `engagement`
  - best-effort metrics object
- `engagement_present`
  - booleans indicating which metrics were present
- `captured_at`
  - ISO datetime set at selection time

## Feed Rule

Feed submission is only valid when a `post_url` can be resolved. If not, the extension must refuse submission and tell the user to open post detail.

## Post Detail Rule

On post-detail pages:

- selecting the post is valid
- selecting a comment is valid as a browser-side target
- submit still uses the thread `post_url` as the ingest target

## Why This Contract Exists

This contract keeps the extension honest:

- selection remains browser-side only
- submit remains compatible with `dlens-ingest-core`
- we do not leak UI-only state into backend capture payloads
