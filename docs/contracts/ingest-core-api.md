# ingest-core API Contract

This repo consumes the existing HTTP contract from `/Users/tung/Desktop/dlens-ingest-core`.

## Base URL

Local dev default:

```text
http://127.0.0.1:8000
```

The extension stores the base URL in local extension state.

## Submit Endpoint

### `POST /capture-target`

Request body:

```json
{
  "source_type": "threads",
  "capture_type": "post",
  "page_url": "https://www.threads.net/@handle/post/AAA",
  "post_url": "https://www.threads.net/@handle/post/AAA",
  "author_hint": "handle",
  "text_snippet": "short snippet",
  "time_token_hint": "21h",
  "dom_anchor": "article:nth-of-type(1)",
  "engagement": {
    "likes": 131,
    "comments": 34,
    "reposts": 1,
    "forwards": 4,
    "views": 22400
  },
  "captured_at": "2026-03-24T00:00:00Z",
  "client_context": {
    "route_type": "post_detail",
    "selection_source": "chrome_extension_v0",
    "target_type": "post",
    "surface": "post_detail"
  }
}
```

Response body:

```json
{
  "capture_id": "uuid",
  "job_id": "uuid",
  "status": "queued",
  "job_type": "threads_post_comments_crawl",
  "canonical_target_url": "https://www.threads.net/@handle/post/AAA"
}
```

## Read Endpoints

### `GET /jobs/{job_id}`

The extension only needs:

- `id`
- `capture_id`
- `status`
- `attempt_count`
- `last_error_kind`
- `last_error`
- `claimed_at`
- `started_at`
- `finished_at`

### `GET /captures/{capture_id}`

The extension only needs:

- `id`
- `canonical_target_url`
- `ingestion_status`
- nested `job`
- nested `result` presence

## Mapping Rules

- `source_type` is always `threads`
- `capture_type` is always `post`
- comment selection still submits with the thread `post_url`
- `client_context.selection_source` is always `chrome_extension_v0`

## UI Status Mapping

The sidebar collapses backend states into:

- backend `pending` -> UI `queued`
- backend `running` -> UI `running`
- backend `succeeded` -> UI `succeeded`
- backend `dead` -> UI `dead`
