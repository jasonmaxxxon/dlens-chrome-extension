import type { WorkerStatus } from "../state/processing-state.ts";
import { TOKENS, processingTone, surfaceCardStyle } from "./components.tsx";

export function ProcessingStrip({
  workerStatus,
  ready,
  total,
  crawling,
  analyzing,
  pending
}: {
  workerStatus: WorkerStatus | null;
  ready: number;
  total: number;
  crawling: number;
  analyzing: number;
  pending: number;
}) {
  const tone = processingTone(workerStatus, ready, total);
  let headline = "Checking processing state";
  if (total > 0 && ready >= 2 && ready === total) {
    headline = "Ready to compare";
  } else if (workerStatus === "draining") {
    headline = "Processing in progress";
  } else if (pending > 0) {
    headline = "Idle — pending items not started";
  } else if (crawling > 0 || analyzing > 0) {
    headline = "Waiting for late updates";
  }

  return (
    <div
      style={{
        ...surfaceCardStyle({
          marginBottom: 12,
          padding: 12,
          display: "grid",
          gap: 8,
          background: tone.background,
          border: `1px solid ${tone.border}`,
          boxShadow: "none"
        })
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: tone.text,
              display: "inline-block",
              animation: workerStatus === "draining" ? "dlens-pulse 1.6s ease-in-out infinite" : undefined
            }}
          />
          <div style={{ fontSize: 13, fontWeight: 800, color: tone.text }}>{headline}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.softInk, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {workerStatus || "idle"}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.ink }}>{ready} / {total} ready</span>
        <span style={{ fontSize: 12, color: TOKENS.subInk }}>{crawling} crawling</span>
        <span style={{ fontSize: 12, color: TOKENS.subInk }}>{analyzing} analyzing</span>
        <span style={{ fontSize: 12, color: TOKENS.subInk }}>{pending} pending</span>
      </div>
    </div>
  );
}
