# ingest-core API Contract

This repo consumes an optional ingest backend over HTTP. The extension runtime only depends on `ingestBaseUrl`; a local backend checkout is a dev convenience, not a runtime requirement.

## Base URL

Local dev default:

```text
http://127.0.0.1:8000
```

The extension stores the base URL in local extension state (`settings.ingestBaseUrl`). The default is loopback. A remote origin, including a Tailscale CGNAT address such as `http://100.115.102.41:8000`, is set in 設定 → 連線. That address is an example for the lam machine, not a source default.

## Authentication

When `settings.ingestApiToken` is non-empty, every ingest request adds:

```http
Authorization: Bearer <token>
```

When the token is empty, the header is omitted so a local backend without auth keeps working. The token is the ingest-core API token, stored only in extension settings. User LLM keys are still never sent to the backend.

This matches the ingest-core Tailscale bind + API token change: the backend accepts `Authorization: Bearer` when its API token is configured, and does not require the header when auth is off. The manifest grants `http://*/*` and `https://*/*` so a saved non-loopback origin is reachable. Match patterns cannot express the Tailscale CGNAT range, and the specific address is not a host permission or a default.

For local full-pipeline dev:

- prefer `DLENS_INGEST_CORE_DIR`
- otherwise `npm run backend:locate` will check `../dlens-ingest-core`
- if no backend checkout is found, extension-only dev still works

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
