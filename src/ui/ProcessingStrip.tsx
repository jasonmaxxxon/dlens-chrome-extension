import {
  getProcessingStripUiState,
  type WorkerStatus,
} from "../state/processing-state.ts";
import { TOKENS, processingTone } from "./components.tsx";
import { tokens } from "./tokens";

function stageCopy(
  phase: "idle" | "queued" | "crawling" | "analyzing" | "ready",
  ready: number,
  total: number
): string {
  if (phase === "ready") {
    return `${ready}/${total} ready`;
  }
  if (phase === "analyzing") {
    return "Mapping comments into clusters...";
  }
  if (phase === "crawling") {
    return ready > 0 ? "Preparing Compare..." : "Capturing comments...";
  }
  if (phase === "queued") {
    return ready > 0 ? "Preparing Compare..." : "等待開始分析";
  }
  return "Waiting for your next capture...";
}

function ProgressRing({
  ready,
  total,
  color
}: {
  ready: number;
  total: number;
  color: string;
}) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.max(0, Math.min(1, ready / safeTotal));
  const size = 22;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <span
      data-processing-ring="visible"
      style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(15,23,42,0.09)" strokeWidth="2.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </span>
  );
}

function SkeletonBar({ width }: { width: string }) {
  return (
    <span
      style={{
        width,
        height: 5,
        borderRadius: tokens.radius.sm,
        background: "linear-gradient(90deg, rgba(148,163,184,0.10) 0%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.10) 100%)",
        backgroundSize: "180% 100%",
        animation: "dlens-popup-shimmer 1.6s linear infinite",
        display: "block"
      }}
    />
  );
}

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
  const tone = processingTone(workerStatus, ready, total, pending);
  const uiState = getProcessingStripUiState(workerStatus, {
    total,
    ready,
    crawling,
    analyzing,
    pending,
    failed: 0,
    hasReadyPair: ready >= 2,
    hasInflight: crawling > 0 || analyzing > 0
  });

  return (
    <div
      data-processing-strip="context"
      data-processing-phase={uiState.phaseLabel}
      data-processing-ready={`${ready}/${total}`}
      style={{
        padding: "7px 12px",
        borderRadius: tokens.radius.pill,
        background: tone.background,
        border: `1px solid ${tone.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        transition: tokens.motion.interactiveTransition,
        marginBottom: 4
      }}
    >
      <ProgressRing ready={ready} total={total} color={tone.text} />

      <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: tone.text,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {uiState.phaseLabel}
        </div>
        <div style={{ fontSize: 10, color: TOKENS.softInk, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stageCopy(uiState.progressMode, ready, total)}
        </div>
        {(workerStatus === "draining" || uiState.progressMode === "analyzing") ? (
          <span data-processing-skeleton="visible" style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0 }}>
            <SkeletonBar width="28%" />
            <SkeletonBar width="22%" />
            <SkeletonBar width="18%" />
          </span>
        ) : (
          <span data-processing-skeleton="hidden" />
        )}
      </div>

      <div style={{ fontSize: 10, color: TOKENS.softInk, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
        {ready}/{total} ready
      </div>
    </div>
  );
}
