import { topicAuditFailureCopy } from "../compare/topic-audit-envelope-contract.ts";
import type { TopicAuditRunFailureKind } from "../compare/topic-audit-envelope-contract.ts";
import type { TopicAuditStageName } from "../compare/topic-audit.ts";
import type { TopicSourceSessionState } from "../viewmodel/topic-detail.ts";
import { PrimaryButton, SecondaryButton, Stamp, SurfaceCard } from "./components.tsx";
import { textStyles, tokens } from "./tokens.ts";

function stageLabel(stage: TopicAuditStageName): string {
  const labels: Record<TopicAuditStageName, string> = {
    "comment-shard-reading": "留言分段",
    "p1-signal-reading": "逐篇判讀",
    lexicon: "詞彙",
    narrative: "敘事",
    audience: "群眾反應",
    absence: "缺席",
    final: "整合"
  };
  return labels[stage];
}

function failureCopy(kind: TopicAuditRunFailureKind): string {
  if (kind === "empty" || kind === "truncated" || kind === "schema_mismatch") {
    return topicAuditFailureCopy(kind);
  }
  if (kind === "timeout") return "生成逾時，舊版 Atlas 仍保留。";
  if (kind === "interrupted") return "上次生成已中斷，舊版 Atlas 仍保留。";
  return "生成服務暫時無法完成，舊版 Atlas 仍保留。";
}

function SessionSpinner() {
  return (
    <span
      aria-hidden="true"
      data-topic-source-session-spinner="true"
      style={{
        width: tokens.spacing.md,
        height: tokens.spacing.md,
        borderRadius: tokens.radius.round,
        border: `${tokens.spacing.xs / tokens.spacing.xs}px solid ${tokens.color.lineStrong}`,
        borderTopColor: tokens.color.queued,
        animation: tokens.motion.keyframes.spin,
        flex: "0 0 auto"
      }}
    />
  );
}

function SessionProgress({
  ready,
  total,
  indeterminate = false
}: {
  ready: number;
  total: number;
  indeterminate?: boolean;
}) {
  const completionPercent = total > 0 ? Math.round((ready / total) * 100) : 0;
  const completion = `${completionPercent}%`;
  return (
    <span
      role="progressbar"
      aria-label="來源處理進度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={indeterminate ? "正在生成 Atlas" : completion}
      {...(indeterminate ? {} : { "aria-valuenow": completionPercent })}
      data-topic-source-session-progress={indeterminate ? "indeterminate" : "determinate"}
      style={{
        display: "block",
        height: tokens.spacing.xs,
        borderRadius: tokens.radius.round,
        overflow: "hidden",
        background: tokens.color.neutralSurface
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: indeterminate ? "38%" : completion,
          borderRadius: tokens.radius.round,
          background: indeterminate ? tokens.color.queued : tokens.color.success,
          animation: indeterminate ? tokens.motion.keyframes.indeterminate : undefined
        }}
      />
    </span>
  );
}

function PreviousFailure({
  failure
}: {
  failure: { stage: TopicAuditStageName; failureKind: TopicAuditRunFailureKind } | undefined;
}) {
  if (!failure) return null;
  return (
    <span data-topic-source-session-previous-failure="true" style={{ ...textStyles.caption, color: tokens.color.failed }}>
      上次於 {stageLabel(failure.stage)} 未完成：{failureCopy(failure.failureKind)}
    </span>
  );
}

export function TopicSourceSessionCard({
  state,
  disabled,
  onAnalyze,
  onStartProcessing,
  onRunAudit
}: {
  state: TopicSourceSessionState;
  disabled: boolean;
  onAnalyze?: () => void;
  onStartProcessing?: () => void;
  onRunAudit?: () => void;
}) {
  if (state.kind === "current") return null;

  const completion = `議題 ${state.ready}/${state.total} 已完成`;
  const stateCopy = state.kind === "needs_crawl"
    ? state.failed > 0 && state.pending === 0
      ? `有 ${state.failed} 篇來源可重試。`
      : `尚有 ${state.pending + state.failed} 篇來源待爬取。`
    : state.kind === "processing"
      ? "來源正在爬取與分析中。"
      : state.kind === "ready_to_generate"
        ? "來源已完成，等待你手動重新生成 Atlas。"
        : state.kind === "generating"
          ? "正在重新生成 Atlas，完成後會原位更新。"
          : `${failureCopy(state.failureKind)} 失敗階段：${stageLabel(state.stage)}。`;
  const processingCounts = state.kind === "processing"
    ? [
        state.queued > 0 ? `已排隊 ${state.queued} 篇` : null,
        state.crawling > 0 ? `正在捕捉 ${state.crawling} 篇` : null,
        state.analyzing > 0 ? `正在分析 ${state.analyzing} 篇` : null
      ].filter(Boolean)
    : [];
  const crawlCount = state.kind === "needs_crawl" ? state.pending + state.failed : 0;

  return (
    <SurfaceCard
      tone="utility"
      dataAttrs={{
        "data-topic-source-session": state.kind,
        "data-dlens-presence": "card"
      }}
      style={{ display: "grid", gap: tokens.spacing.sm, boxShadow: tokens.shadow.topicCard }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacing.sm, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: tokens.spacing.sm, minWidth: 0 }}>
          {state.kind === "processing" || state.kind === "generating" ? <SessionSpinner /> : null}
          {state.kind === "ready_to_generate" ? <span aria-hidden="true" style={{ color: tokens.color.success }}>✓</span> : null}
          <span style={{ ...textStyles.label, color: tokens.color.ink }}>來源處理</span>
        </span>
        <Stamp tone={state.kind === "generation_failed" || state.kind === "needs_crawl" ? "warning" : state.kind === "ready_to_generate" ? "success" : "accent"}>
          {completion}
        </Stamp>
      </div>

      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: tokens.spacing.xs / tokens.spacing.xs,
          height: tokens.spacing.xs / tokens.spacing.xs,
          padding: 0,
          margin: -(tokens.spacing.xs / tokens.spacing.xs),
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0
        }}
      >
        {completion}。{stateCopy}
      </span>

      <div style={{ display: "grid", gap: tokens.spacing.xs }}>
        <span style={{ ...textStyles.bodyTight, color: tokens.color.subInk }}>{stateCopy}</span>
        {state.kind === "processing" ? (
          <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>{processingCounts.join(" · ")}</span>
        ) : null}
        {state.kind === "needs_crawl" || state.kind === "processing" ? <PreviousFailure failure={state.previousGenerationFailure} /> : null}
      </div>

      <SessionProgress ready={state.ready} total={state.total} indeterminate={state.kind === "generating"} />

      {state.kind === "needs_crawl" ? (
        <PrimaryButton onClick={() => onAnalyze?.()} disabled={disabled || !onAnalyze}>
          {state.failed > 0 && state.pending === 0 ? `重試 ${crawlCount} 篇` : `開始爬取 ${crawlCount} 篇`}
        </PrimaryButton>
      ) : null}
      {state.kind === "processing" && onStartProcessing ? (
        <SecondaryButton onClick={onStartProcessing} disabled={disabled}>
          啟動處理
        </SecondaryButton>
      ) : null}
      {state.kind === "ready_to_generate" ? (
        <PrimaryButton onClick={() => onRunAudit?.()} disabled={disabled || !onRunAudit}>
          用 {state.ready} 篇重新生成 Atlas
        </PrimaryButton>
      ) : null}
      {state.kind === "generation_failed" ? (
        <PrimaryButton onClick={() => onRunAudit?.()} disabled={disabled || !onRunAudit}>
          重試生成
        </PrimaryButton>
      ) : null}
    </SurfaceCard>
  );
}
