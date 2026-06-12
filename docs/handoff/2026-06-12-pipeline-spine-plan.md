# DLens — Pipeline Spine plan

> Date: 2026-06-12 · Author: Claude (plan) for Codex (execution) · Baseline: `main` @ `8de536a` (0.1.33, 718/718)
> Predecessors: `2026-06-11-invariant-consolidation-plan.md` (slices ①–⑨), `2026-06-11-0.2-viewmodel-boundary-plan.md` (Product/Topic/Compare/PrEvidence VMs — all merged)

## The one idea

The app already emits ~40 ad-hoc `markQaTrace("some.string")` markers across 5 files, untyped, flag-gated. Promote them into **one typed pipeline event stream keyed to the real lifecycle**, so debugging is *reading a trace*, not *guessing UI state* — the exact gap we hit repeatedly during QA (B-01/05/09/10/12 were all "where did the pipeline actually stall?").

> **Debug by trace, not by guess.** Every pipeline step emits a typed `PipelineEvent { phase, target, result }` into one stream. A deterministic summarizer says where it stalled.

This is the **temporal/event view** of the same truths the classifiers + VMs already own:
- `capture.ready` ⟷ `captured-post.ts` / `signal-readiness.ts`
- `analysis.ready` / `ui.ready` ⟷ the VM `loadState` / `analysisState` / `provenance`
- `target` on every event ⟷ slice ⑤ explicit target

So the spine is **not** new truth — it's the timeline along which the existing truths transition.

## ⚠️ This phase ADDS a layer — so the discipline is "absorb, don't parallel"

Unlike the consolidation/VM phases (which collapsed scattered truth), the spine introduces an observability layer. The collapse rule still applies, restated:
- **Replace** the ~40 ad-hoc `markQaTrace("string")` markers with typed `emit({phase,...})`. Do **not** run a second parallel trace alongside the old one.
- **OBSERVE the deferred frontiers, do not rewrite them.** Hover DOM extraction (`findCardCandidate`/`buildTargetDescriptor`) and the storage transaction seam are deferred (see consolidation plan). The spine emits events *around* them (e.g. `hover.detected` with the descriptor result) — it must not refactor them.
- **Stay flag-gated.** Normal users get zero overhead (today's `qa-trace` gating via sessionStorage/URL flag is preserved).

## Phase enum (the spine)

```ts
type PipelinePhase =
  | "hover.detected"      // content: card candidate + descriptor resolved
  | "preview.confirmed"   // content/popup: user confirmed a target to collect
  | "signal.saved"        // signal persisted (seam write)
  | "crawl.queued"        // backend job submitted
  | "capture.ready"       // ThreadReadModel / assembled content available
  | "analysis.ready"      // ProductSignal / Topic audit / Compare brief produced
  | "ui.ready";           // VM rendered the result
```

Existing markers map onto these (migration table for slice 1):

| current `markQaTrace` string | phase |
|---|---|
| `content.hover.*`, `content.overlay.*` | `hover.detected` |
| `content.collect.click.*`, `*.collect.save.request` | `preview.confirmed` → `signal.saved` |
| `*.collect.save.response`, `*.collect.toggle.*`, `content.selection.*` | `signal.saved` (+ selection control sub-events) |
| `popup.worker.status/refresh/next-poll` | `crawl.queued` / `capture.ready` |
| `popup.product.analyze.*` | `analysis.ready` |
| `popup.*.hydrate.*` | `ui.ready` |

## Event contract (slice 1)

New pure module **`src/state/pipeline-trace.ts`** (shared by content script + background + UI — NOT `src/ui`, since background emits too):

```ts
export interface PipelineEvent {
  phase: PipelinePhase;
  step: string;              // sub-label, e.g. "click" / "keyboard" / "response"
  target: { sessionId?: string; signalId?: string; itemId?: string; tabId?: number }; // slice ⑤ explicit
  result: "ok" | "pending" | "error";
  detail?: unknown;          // compacted, never raw API keys
  at: number;
}
export function emitPipelineEvent(e: Omit<PipelineEvent, "at">): void; // flag-gated, mirrors to DOM like today
```

The flag-gating + DOM mirror + buffer cap from today's `src/ui/qa-trace.ts` move into / are reused by this module; `qa-trace.ts` becomes a thin typed adapter or is absorbed.

## Slices (one PR each, off `main`, green, no version bump)

1. **Contract + typed emitter (collapse the strings).** Define `PipelinePhase` + `PipelineEvent` + `emitPipelineEvent` in `src/state/pipeline-trace.ts`. Migrate all ~40 `markQaTrace("string")` call sites (5 files: `threads.content.ts`, `useInPageCollectorAppState.ts`, `useTopicState.ts`, `useProcessingCoordinator.ts`) to typed `emit({phase, step, target, result})`. Characterization: the same events still fire under the flag; add an invariant test that every emit has a valid `phase` + `target`. Net: untyped strings → typed; no parallel system.
2. **Instrument the collect→capture vertical end-to-end.** Ensure `hover.detected → preview.confirmed → signal.saved → crawl.queued → capture.ready` each emit with explicit `target` + `result` at the content/background boundaries. This is the path with the most historical bugs. OBSERVE hover extraction (emit its descriptor result), don't rewrite it.
3. **Wire the terminal from the VM.** `analysis.ready → ui.ready` emitted from the ViewModel layer — the VM's `loadState`/`analysisState` transition IS `ui.ready`. Closes the loop end-to-end.
4. **Deterministic summarizer + live QA harness.** Formalize `scripts/qa-trace-summary.mjs` into a "where did the pipeline stall" report (per-hop latency, missing terminal phase, first `error` phase). Then the smoke harness: build → reload → hover → collect → queue → analysis → render, dump trace JSON, **assert the terminal `ui.ready` phase was reached**. This is the automated answer to "green tests ≠ live verified" — the gap that bit us all through QA.

## Governing rules (carried forward)

1. One slice per PR; characterization-test-first; branch off `main`; green (`typecheck` + full suite + `build`); **no version bump** in a slice.
2. Collapse — replace the ad-hoc markers, don't add a parallel trace.
3. OBSERVE-only on deferred frontiers (hover DOM extraction, storage transaction). No rewrite this phase.
4. Flag-gated; zero overhead for normal users.
5. Do NOT touch: storage backward-compat normalize, backend polling/backoff, error boundaries.

## Definition of done (per slice)

- Typed events in `src/state/pipeline-trace.ts`; emitters migrated (grep: no remaining `markQaTrace("…")` after slice 1).
- Characterization + invariant test (`every event has phase+target`; vertical reaches its terminal phase).
- `typecheck` + full suite + `build` green; one PR; no version bump.
- One line appended here: slice ✓, what was absorbed.

2026-06-12 Slice 1 ✓ — added `src/state/pipeline-trace.ts` with the locked seven-phase `PipelineEvent` contract, flag-gated typed emitter, DOM mirror, buffer cap, and validator; `src/ui/qa-trace.ts` is now only a typed adapter. Absorbed all production `markQaTrace("...")` call sites in `threads.content.ts`, `useInPageCollectorAppState.ts`, `useTopicState.ts`, and `useProcessingCoordinator.ts` into `emitPipelineEvent({ phase, step, target, result })` without rewriting hover extraction, storage transactions, polling/backoff, or UI behavior. Added characterization/boundary tests for flag-gating, structured entries, valid phases, explicit target objects, and grep-clean migrated call sites.

2026-06-12 Slice 2 ✓ — instrumented the collect→capture vertical with request-correlated typed events: `PipelineEvent.requestId`, optional `ExtensionMessage.requestId`, and background-safe trace sinks now let content/popup request events line up with background response events. Added background boundary emits for `session/save-current-preview` (`signal.saved`), `queue-*` / `worker/start-processing` / `worker/get-status` (`crawl.queued`), and `refresh-*` (`capture.ready`) with explicit `target` + `result`, without rewriting hover extraction, storage transactions, polling/backoff, or UI state. Added behavior and boundary tests for save/queue/refresh request-response pairs and requestId validation.

## After the spine

With the spine + harness in place, the deferred frontiers become tractable as **observed** problems: hover DOM extraction can get fixture-replay hardening (now that `hover.detected` results are traced), and the storage transaction seam can be deepened only where the trace shows real inconsistency. Product-value track (backend OP/reply read-model — the analysis-trustworthiness lever) remains parallel and unblocked.
