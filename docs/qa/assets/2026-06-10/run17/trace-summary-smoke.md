# DLens QA Trace Summary

- Label: run17-smoke
- Trace: `docs/qa/assets/2026-06-10/run17/trace-summary-smoke-input.json`
- Events: 8
- Duration: 1475 ms

## Latency Pairs

| Pair | Count | Avg | P50 | P95 | Max | Missing end |
|------|------:|----:|----:|----:|----:|------------:|
| collect toggle roundtrip | 1 | 245.2 | 245.2 | 245.2 | 245.2 | 0 |
| content selection rehydrate | 0 |  |  |  |  | 0 |
| hover to overlay render | 1 | 18 | 18 | 18 | 18 | 0 |
| hover descriptor publish | 0 |  |  |  |  | 0 |
| collect click to save response | 1 | 182.4 | 182.4 | 182.4 | 182.4 | 0 |
| topic/signal hydration | 0 |  |  |  |  | 0 |
| product hydration | 1 | 275 | 275 | 275 | 275 | 0 |
| product analyze | 0 |  |  |  |  | 0 |
| worker status poll | 0 |  |  |  |  | 0 |
| worker refresh | 0 |  |  |  |  | 0 |
| worker error backoff | 0 |  |  |  |  | 0 |

## Slowest Event Gaps

| Gap | From | To |
|----:|------|----|
| 472 | content.overlay.render | content.collect.click.capture |
| 275 | popup.product.hydrate.request | popup.product.hydrate.response |
| 245.2 | popup.collect.toggle.request | popup.collect.toggle.response |
| 217.6 | content.collect.save.response | popup.product.hydrate.request |
| 182.4 | content.collect.click.capture | content.collect.save.response |
| 64.8 | popup.collect.toggle.response | content.hover.card-change |
| 18 | content.hover.card-change | content.overlay.render |

## Event Counts

- `content.collect.click.capture`: 1
- `content.collect.save.response`: 1
- `content.hover.card-change`: 1
- `content.overlay.render`: 1
- `popup.collect.toggle.request`: 1
- `popup.collect.toggle.response`: 1
- `popup.product.hydrate.request`: 1
- `popup.product.hydrate.response`: 1
