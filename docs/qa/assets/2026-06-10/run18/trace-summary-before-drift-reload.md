# DLens QA Trace Summary

- Label: trace-before-product-drift-reload
- Trace: `docs/qa/assets/2026-06-10/run18/trace-before-product-drift-reload.json`
- Events: 500
- Duration: 496328.7 ms

## Latency Pairs

| Pair | Count | Avg | P50 | P95 | Max | Missing end |
|------|------:|----:|----:|----:|----:|------------:|
| collect toggle roundtrip | 0 |  |  |  |  | 0 |
| content selection rehydrate | 0 |  |  |  |  | 0 |
| hover to overlay render | 0 |  |  |  |  | 1 |
| hover descriptor publish | 0 |  |  |  |  | 0 |
| collect click to save response | 0 |  |  |  |  | 0 |
| topic/signal hydration | 42 | 378.8 | 355.8 | 628.8 | 922.4 | 0 |
| product hydration | 42 | 380.5 | 354.7 | 627.1 | 919.9 | 0 |
| product analyze | 1 | 377.1 | 377.1 | 377.1 | 377.1 | 0 |
| worker status poll | 45 | 37957.2 | 28775.8 | 74302.3 | 248350 | 176 |
| worker refresh | 26 | 44556.7 | 48287.9 | 58801.9 | 60797.7 | 0 |
| worker error backoff | 0 |  |  |  |  | 3 |

## Slowest Event Gaps

| Gap | From | To |
|----:|------|----|
| 173943.1 | popup.worker.status.response | popup.worker.status.request |
| 115730.1 | popup.worker.status.response | popup.product.analyze.request |
| 105102.8 | popup.worker.status.error | content.overlay.hide |
| 3129.2 | popup.worker.refresh.request | popup.worker.status.request |
| 2612.8 | popup.worker.refresh.request | popup.worker.status.request |
| 2545.5 | popup.worker.status.response | popup.worker.status.request |
| 2469.5 | popup.worker.status.response | popup.worker.status.request |
| 1945.5 | popup.worker.status.response | popup.worker.status.request |
| 1796.7 | popup.worker.status.response | popup.worker.status.request |
| 1707.2 | popup.worker.status.response | popup.worker.status.request |
| 1700.9 | popup.worker.status.response | popup.worker.status.request |
| 1674.5 | popup.worker.refresh.request | popup.worker.status.request |

## Event Counts

- `content.collect.click.pass-through`: 1
- `content.hover.card-change`: 1
- `content.hover.publish`: 1
- `content.overlay.hide`: 1
- `popup.product.analyze.request`: 1
- `popup.product.analyze.response`: 1
- `popup.product.hydrate.request`: 42
- `popup.product.hydrate.response`: 43
- `popup.topic.hydrate.request`: 42
- `popup.topic.hydrate.response`: 43
- `popup.worker.refresh.request`: 26
- `popup.worker.refresh.response`: 29
- `popup.worker.status.error`: 3
- `popup.worker.status.request`: 221
- `popup.worker.status.response`: 45
