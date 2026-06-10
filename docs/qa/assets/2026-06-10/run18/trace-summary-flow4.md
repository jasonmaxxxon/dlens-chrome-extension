# DLens QA Trace Summary

- Label: trace-after-flow4-action-route
- Trace: `docs/qa/assets/2026-06-10/run18/trace-after-flow4-action-route.json`
- Events: 500
- Duration: 276123.6 ms

## Latency Pairs

| Pair | Count | Avg | P50 | P95 | Max | Missing end |
|------|------:|----:|----:|----:|----:|------------:|
| collect toggle roundtrip | 0 |  |  |  |  | 0 |
| content selection rehydrate | 0 |  |  |  |  | 0 |
| hover to overlay render | 0 |  |  |  |  | 0 |
| hover descriptor publish | 0 |  |  |  |  | 0 |
| collect click to save response | 0 |  |  |  |  | 0 |
| topic/signal hydration | 44 | 383.7 | 356.2 | 628.8 | 922.4 | 0 |
| product hydration | 44 | 385.3 | 354.8 | 627.1 | 919.9 | 0 |
| product analyze | 0 |  |  |  |  | 0 |
| worker status poll | 45 | 41201.6 | 31883.9 | 76392.7 | 252415.1 | 176 |
| worker refresh | 27 | 42960.9 | 48287.9 | 58801.9 | 60797.7 | 0 |
| worker error backoff | 0 |  |  |  |  | 0 |

## Slowest Event Gaps

| Gap | From | To |
|----:|------|----|
| 173943.1 | popup.worker.status.response | popup.worker.status.request |
| 3129.2 | popup.worker.refresh.request | popup.worker.status.request |
| 2612.8 | popup.worker.refresh.request | popup.worker.status.request |
| 2545.5 | popup.worker.status.response | popup.worker.status.request |
| 2469.5 | popup.worker.status.response | popup.worker.status.request |
| 1945.5 | popup.worker.status.response | popup.worker.status.request |
| 1796.7 | popup.worker.status.response | popup.worker.status.request |
| 1707.2 | popup.worker.status.response | popup.worker.status.request |
| 1700.9 | popup.worker.status.response | popup.worker.status.request |
| 1674.5 | popup.worker.refresh.request | popup.worker.status.request |
| 1669.9 | popup.worker.status.response | popup.worker.status.request |
| 1669.5 | popup.worker.status.response | popup.worker.status.request |

## Event Counts

- `popup.product.hydrate.request`: 44
- `popup.product.hydrate.response`: 44
- `popup.topic.hydrate.request`: 44
- `popup.topic.hydrate.response`: 44
- `popup.worker.refresh.request`: 27
- `popup.worker.refresh.response`: 30
- `popup.worker.status.request`: 221
- `popup.worker.status.response`: 46
