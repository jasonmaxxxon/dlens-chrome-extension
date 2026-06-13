# DLens QA Trace Summary

- Status: pass
- Label: full-hover-save-queue-analysis-backend-llm
- Trace: `docs/qa/assets/2026-06-13/full-live-backend-llm/live-trace-full-hover-save-queue-analysis.json`
- Events: 900
- Duration: 211792.4 ms
- Terminal `ui.ready`: reached
- Required phases: reached

## Phase Journey

| Phase | Step | Result | At |
|------|------|--------|---:|
| signal.saved | content.selection.sync.request | pending | 2079.2 |
| ui.ready | popup.topic.hydrate.skip | ok | 2116.5 |
| crawl.queued | popup.worker.status.request | pending | 22280.4 |
| capture.ready | background.session.refresh-all.request | pending | 2373594.8 |
| backend.request | backend.worker-status.response | ok | 2373600 |
| hover.detected | content.overlay.render | ok | 70882.9 |
| preview.confirmed | content.collect.click.capture | ok | 71860 |
| analysis.ready | popup.product.analyze.request | pending | 125078.8 |
| llm.call | direct-llm.Google.request | pending | 2517096.5 |

## Phase Transitions

| Transition | Latency ms |
|------------|-----------:|
| signal.saved -> ui.ready | 37.3 |
| ui.ready -> crawl.queued | 20163.9 |
| crawl.queued -> capture.ready | 2351314.4 |
| capture.ready -> backend.request | 5.2 |
| backend.request -> hover.detected | -2302717.1 |
| hover.detected -> preview.confirmed | 977.1 |
| preview.confirmed -> analysis.ready | 53218.8 |
| analysis.ready -> llm.call | 2392017.7 |

## Legacy Latency Pairs

| Pair | Count | Avg | P50 | P95 | Max | Missing end |
|------|------:|----:|----:|----:|----:|------------:|
| collect toggle roundtrip | 0 |  |  |  |  | 0 |
| content selection rehydrate | 0 |  |  |  |  | 0 |
| hover to overlay render | 0 |  |  |  |  | 0 |
| hover descriptor publish | 0 |  |  |  |  | 0 |
| collect click to save response | 0 |  |  |  |  | 0 |
| topic/signal hydration | 0 |  |  |  |  | 0 |
| product hydration | 0 |  |  |  |  | 0 |
| product analyze | 0 |  |  |  |  | 0 |
| worker status poll | 0 |  |  |  |  | 0 |
| worker refresh | 0 |  |  |  |  | 0 |
| worker error backoff | 0 |  |  |  |  | 0 |

## Slowest Event Gaps

| Gap | From | To |
|----:|------|----|
| 2352160.9 | crawl.queued:popup.worker.next-poll | backend.request:backend.job.response |
| 2352107.5 | crawl.queued:popup.worker.next-poll | backend.request:backend.job.response |
| 2351815.7 | crawl.queued:popup.worker.next-poll | signal.saved:background.session.save-current-preview.response |
| 2351573.8 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351547.4 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351539.7 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351486.2 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351474.1 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351465.6 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351460.3 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351450.1 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |
| 2351446.2 | crawl.queued:popup.worker.status.request | crawl.queued:background.worker.get-status.request |

## Phase Counts

- `analysis.ready`: 2
- `backend.request`: 301
- `capture.ready`: 52
- `crawl.queued`: 436
- `hover.detected`: 8
- `llm.call`: 2
- `preview.confirmed`: 1
- `signal.saved`: 10
- `ui.ready`: 88

## Event Counts

- `analysis.ready:popup.product.analyze.request`: 1
- `analysis.ready:popup.product.analyze.response`: 1
- `backend.request:backend.capture-target.request`: 1
- `backend.request:backend.capture-target.response`: 1
- `backend.request:backend.capture.request`: 14
- `backend.request:backend.capture.response`: 12
- `backend.request:backend.job.request`: 14
- `backend.request:backend.job.response`: 12
- `backend.request:backend.worker-drain.request`: 1
- `backend.request:backend.worker-drain.response`: 1
- `backend.request:backend.worker-status.request`: 124
- `backend.request:backend.worker-status.response`: 121
- `capture.ready:background.session.refresh-all.request`: 23
- `capture.ready:background.session.refresh-all.response`: 4
- `capture.ready:popup.worker.refresh.request`: 22
- `capture.ready:popup.worker.refresh.response`: 3
- `crawl.queued:background.worker.get-status.request`: 124
- `crawl.queued:background.worker.get-status.response`: 118
- `crawl.queued:popup.worker.next-poll`: 23
- `crawl.queued:popup.worker.status.request`: 126
- `crawl.queued:popup.worker.status.response`: 45
- `hover.detected:content.hover.card-change`: 2
- `hover.detected:content.hover.intent-fired`: 1
- `hover.detected:content.hover.publish`: 2
- `hover.detected:content.overlay.hide`: 1
- `hover.detected:content.overlay.render`: 2
- `llm.call:direct-llm.Google.request`: 1
- `llm.call:direct-llm.Google.response`: 1
- `preview.confirmed:content.collect.click.capture`: 1
- `signal.saved:background.session.save-current-preview.request`: 1
- `signal.saved:background.session.save-current-preview.response`: 1
- `signal.saved:content.collect.save.request`: 1
- `signal.saved:content.collect.save.response`: 1
- `signal.saved:content.selection.start`: 1
- `signal.saved:content.selection.stop`: 1
- `signal.saved:content.selection.sync.request`: 1
- `signal.saved:content.selection.sync.response`: 1
- `signal.saved:popup.collect.toggle.request`: 1
- `signal.saved:popup.collect.toggle.response`: 1
- `ui.ready:popup.product.hydrate.request`: 16
- `ui.ready:popup.product.hydrate.response`: 16
- `ui.ready:popup.product.hydrate.skip`: 9
- `ui.ready:popup.product.vm.empty`: 1
- `ui.ready:popup.product.vm.loading`: 1
- `ui.ready:popup.product.vm.ready`: 4
- `ui.ready:popup.topic.hydrate.request`: 18
- `ui.ready:popup.topic.hydrate.response`: 18
- `ui.ready:popup.topic.hydrate.skip`: 2
- `ui.ready:reconcile.stale-result.ignore`: 3
