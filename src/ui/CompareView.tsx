import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisSnapshot } from "../contracts/ingest";
import type { CompareBrief } from "../compare/brief.ts";
import type { CompareResultLayout } from "../state/types";
import { TOKENS, tokens } from "./tokens";
import { buildTechniqueReadingSnapshot } from "../compare/technique-reading.ts";
import type {
  ClusterMapNode,
  ClusterSummaryCard,
  CompareHeroSummary,
  SelectedClusterDetail,
  SelectedClusterSupportMetric
} from "../analysis/types.ts";
import { EvidenceMetricRow, PrimaryButton, skeletonBlockStyle } from "./components.tsx";
import {
  DictionaryCard,
  SectionLabel
} from "./CompareView.parts.tsx";
import { TechniqueView } from "./TechniqueView.tsx";
import type { EvidenceAnnotation, EvidenceAnnotationRequest } from "../compare/evidence-annotation.ts";
import type {
  CompareCommand,
  ClusterSurface,
  CommentData,
  CompareBriefSurfaceState,
  CompareSide,
  CompareReadinessViewModel,
  CompareReadyItemOption,
  CompareViewModel,
  MetricDisplay,
  PostData
} from "../viewmodel/compare.ts";
import {
  analysisMetrics,
  authorStanceSummary,
  buildClusterSummaries,
  clusterSupportLabel,
  compareSelectionKey,
  diffColor as resolveMetricDiffColor,
  divergenceDirection,
  findRelatedCluster,
  getDominanceLabel,
  getPost,
  getPostAge,
  getRawMetricDisplay,
  getVelocityMetricDisplay,
  hasConfiguredProviderKey,
  hiddenClusterCountLabel,
  layoutClusterMapNodes,
  resolveEvidenceKeywordFilter,
  resolveClusterSurface,
  selectedClusterDetailFromSurface,
  surfacedEvidenceCount,
  visibleClusterCountLabel
} from "../viewmodel/compare.ts";
const ACCENT_BORDER = tokens.color.accentGlow;
const QUEUED_BORDER = tokens.color.queuedSoft;
const T = {
  ink: TOKENS.ink,
  sub: TOKENS.subInk,
  soft: TOKENS.softInk,
  line: TOKENS.line,
  bg: tokens.color.neutralSurface,
  accent: TOKENS.accent,
  accentSoft: TOKENS.accentSoft,
  accentBorder: ACCENT_BORDER,
  success: TOKENS.success,
  successSoft: TOKENS.successSoft,
  warn: TOKENS.queued,
  warnSoft: TOKENS.queuedSoft,
  warnBorder: QUEUED_BORDER,
  fail: TOKENS.failed,
  failSoft: TOKENS.failedSoft,
  running: TOKENS.running,
  runningSoft: TOKENS.runningSoft
} as const;
const COMPARE_MODE_ACCENT = `var(--dlens-mode-accent, ${tokens.color.accent})`;
const COMPARE_MODE_ACCENT_MID = `var(--dlens-mode-accent-mid, ${tokens.color.accentMid})`;
const COMPARE_MODE_ACCENT_SOFT = `var(--dlens-mode-accent-soft, ${tokens.color.accentSoft})`;
const COMPARE_MODE_ACCENT_GLOW = `var(--dlens-mode-accent-glow, ${tokens.color.accentGlow})`;
const COMPARE_CARD_SHADOW = tokens.shadow.glass;
const COMPARE_ACTIVE_CONTROL_SHADOW = tokens.shadow.activeTab;
const COMPARE_PANEL_BACKGROUND = `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.contentSurface})`;
const COMPARE_PANEL_INSET_BACKGROUND = `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contextSurface})`;

interface CompareViewProps {
  viewModel: CompareViewModel;
  onCommand: (command: CompareCommand) => Promise<unknown> | unknown;
}

interface ClusterSelectionRef {
  key: string;
}

const WRAP_ANYWHERE = {
  minWidth: 0,
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const
};

function diffColor(left: number | null, right: number | null): string {
  return resolveMetricDiffColor(left, right, { soft: T.soft, success: T.success, fail: T.fail });
}

/* ── Compact Post Header (replaces old PostCard) ── */

function PostHeader({ post, label, color, borderColor, commentCount }: {
  post: PostData;
  label: string;
  color: string;
  borderColor: string;
  commentCount: number;
}) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: color, border: `1.5px solid ${borderColor}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 6, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.soft, letterSpacing: "0.02em", lineHeight: 1.4 }}>{label}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginLeft: 8, ...WRAP_ANYWHERE }}>@{post.author || "unknown"}</span>
        </div>
        <span style={{ fontSize: 11, color: T.soft, whiteSpace: "nowrap" as const }}>{getPostAge(post).label}</span>
      </div>
      <div style={{
        fontSize: 12, color: T.sub, lineHeight: 1.55,
        display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden"
      }}>
        {post.text || "No text available"}
      </div>
      <div style={{ fontSize: 11, color: T.soft, marginTop: 6 }}>
        {commentCount > 0 ? `${commentCount} comments captured` : "No comments captured"}
      </div>
    </div>
  );
}

/* ── Post context strip (what are these two posts about) ── */

function PostContextCard({
  post,
  side,
  captured,
  age
}: {
  post: PostData | null;
  side: "A" | "B";
  captured: number;
  age: string | null;
}) {
  const isA = side === "A";
  const accentColor = isA ? T.accent : T.warn;
  const softBg = isA ? T.accentSoft : T.warnSoft;
  const border = isA ? T.accentBorder : T.warnBorder;
  const totalComments = post?.metrics && typeof post.metrics["comments"] === "number"
    ? (post.metrics["comments"] as number)
    : null;
  const commentLabel = totalComments != null
    ? `${totalComments} comments`
    : captured > 0
      ? `${captured} captured`
      : null;

  return (
    <div style={{ padding: "10px 12px", borderRadius: tokens.radius.card, border: `1px solid ${border}`, background: softBg, display: "grid", gap: 5, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" as const, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: accentColor, whiteSpace: "nowrap" as const }}>{`Post ${side}`}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, ...WRAP_ANYWHERE }}>{`@${post?.author || "unknown"}`}</span>
      </div>
      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5, display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden", minWidth: 0 }}>
        {post?.text || "—"}
      </div>
      <div style={{ fontSize: 10, color: T.soft, display: "flex", gap: 4, flexWrap: "wrap" as const }}>
        {commentLabel ? <span>{commentLabel}</span> : null}
        {commentLabel && age ? <span>·</span> : null}
        {age ? <span>{age}</span> : null}
      </div>
    </div>
  );
}

function PostContextStrip({
  postA,
  postB,
  capturedA,
  capturedB,
  ageA,
  ageB
}: {
  postA: PostData | null;
  postB: PostData | null;
  capturedA: number;
  capturedB: number;
  ageA: string | null;
  ageB: string | null;
}) {
  if (!postA && !postB) return null;
  return (
    <div data-post-context-strip="visible" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <PostContextCard post={postA} side="A" captured={capturedA} age={ageA} />
      <PostContextCard post={postB} side="B" captured={capturedB} age={ageB} />
    </div>
  );
}

/* ── Engagement metric row with delta ── */

function MetricRow({ label, left, right }: { label: string; left: MetricDisplay; right: MetricDisplay }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 4, padding: "6px 0", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "capitalize" as const, minWidth: 0 }}>{label}</span>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: left.emphasized ? 800 : 700, color: left.emphasized ? diffColor(left.numeric, right.numeric) : T.soft }}>
          {left.text}
        </span>
      </div>
      <div style={{ textAlign: "right", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: right.emphasized ? 800 : 700, color: right.emphasized ? diffColor(right.numeric, left.numeric) : T.soft }}>
          {right.text}
        </span>
      </div>
    </div>
  );
}

/* ── Audience navigator ── */

function bubbleTone(node: ClusterMapNode, side: CompareSide) {
  // Single indigo scale for Post A, single amber scale for Post B.
  // Tone steps: primary > supportive > cautious > minor (near-neutral).
  const palette = side === "left"
    ? {
        primary:    { fill: tokens.color.accentSoft, border: tokens.color.accentGlow, text: tokens.color.accent },
        supportive: { fill: tokens.color.runningSoft, border: tokens.color.accentGlow, text: tokens.color.running },
        cautious:   { fill: tokens.color.neutralSurfaceSoft, border: tokens.color.lineStrong, text: tokens.color.softInk },
        minor:      { fill: tokens.color.idleBg, border: T.line, text: T.soft }
      }
    : {
        primary:    { fill: tokens.color.queuedSoft, border: tokens.color.queuedSoft, text: tokens.color.queued },
        supportive: { fill: tokens.topicAccent.tintAmber, border: tokens.color.queuedSoft, text: tokens.color.queued },
        cautious:   { fill: tokens.color.neutralSurfaceSoft, border: tokens.color.lineStrong, text: tokens.color.softInk },
        minor:      { fill: tokens.color.idleBg, border: T.line, text: T.soft }
      };
  if (node.toneVariant === "minor") {
    return {
      background: palette.minor.fill,
      border: `1px dashed ${palette.minor.border}`,
      color: palette.minor.text,
      glow: "none"
    };
  }
  const tone = node.toneVariant === "cautious"
    ? palette.cautious
    : node.toneVariant === "supportive"
      ? palette.supportive
      : palette.primary;
  return {
    background: tone.fill,
    border: `1px solid ${tone.border}`,
    color: tone.text,
    glow: `0 8px 20px ${tone.border}40`
  };
}

function clusterNavigatorLabel(node: ClusterMapNode): string {
  return `${node.title} · ${Math.round(node.sizeShare * 100)}%`;
}

function ClusterBubbleMap({
  side,
  label,
  nodes,
  countLabel,
  hiddenLabel,
  selectedKey,
  hoveredKey,
  onHover,
  onLeave,
  onSelect
}: {
  side: CompareSide;
  label: string;
  nodes: ClusterMapNode[];
  countLabel: string;
  hiddenLabel: string | null;
  selectedKey: string | null;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onLeave: () => void;
  onSelect: (key: string) => void;
}) {
  const previewNode = nodes.find((node) => compareSelectionKey(node.captureId, node.clusterKey) === hoveredKey) || null;
  const previewLeft = previewNode
    ? Math.min(212, Math.max(8, previewNode.x))
    : 0;
  const previewTop = previewNode
    ? Math.max(8, previewNode.y - previewNode.r / 2 - 30)
    : 0;

  return (
    <div
      data-cluster-map={side}
      style={{
        position: "relative",
        minHeight: 280,
        borderRadius: 12,
        border: `1px solid ${T.line}`,
        background: COMPARE_PANEL_BACKGROUND,
        boxShadow: COMPARE_CARD_SHADOW,
        overflow: "hidden"
      }}
    >
      <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel color={side === "left" ? T.accent : T.warn}>{label}</SectionLabel>
        <div style={{ fontSize: 11, color: T.soft, ...WRAP_ANYWHERE }}>{countLabel}</div>
      </div>
      {hiddenLabel ? (
        <div style={{ padding: "0 14px 8px", fontSize: 10, color: T.soft, ...WRAP_ANYWHERE }}>{hiddenLabel}</div>
      ) : null}
      <div style={{ position: "relative", height: 228, margin: "0 10px 10px", borderRadius: 12, background: COMPARE_PANEL_INSET_BACKGROUND }}>
        {nodes.map((node) => {
          const key = compareSelectionKey(node.captureId, node.clusterKey);
          const selected = selectedKey === key;
          const tone = bubbleTone(node, side);
          return (
            <button
              key={key}
              type="button"
              data-cluster-node={key}
              data-cluster-selected={selected ? "true" : "false"}
              onMouseEnter={() => onHover(key)}
              onMouseLeave={onLeave}
              onClick={() => onSelect(key)}
              title={`${clusterNavigatorLabel(node)} · ${node.supportCount} comments`}
              style={{
                position: "absolute",
                left: `calc(${node.x}% - ${node.r / 2}px)`,
                top: `calc(${node.y}% - ${node.r / 2}px)`,
                width: node.r,
                height: node.r,
                borderRadius: "50%",
                border: tone.border,
                background: tone.background,
                color: tone.color,
                boxShadow: selected ? `0 0 0 3px ${side === "left" ? T.accentSoft : T.warnSoft}, ${tone.glow}` : tone.glow,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                transition: tokens.motion.transition
              }}
            >
              <span style={{ fontSize: node.r > 52 ? 12 : 10, fontWeight: 800 }}>{Math.round(node.sizeShare * 100)}%</span>
            </button>
          );
        })}
        {previewNode ? (
          <div
            data-cluster-preview="visible"
            style={{
              position: "absolute",
              left: `min(calc(${previewLeft}% - 72px), calc(100% - 184px))`,
              top: `max(8px, calc(${previewTop}% - 12px))`,
              minWidth: 144,
              maxWidth: 176,
              borderRadius: tokens.radius.card,
              background: tokens.color.elevated,
              border: `1px solid ${T.line}`,
              boxShadow: COMPARE_CARD_SHADOW,
              padding: "8px 10px",
              zIndex: 2
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: T.ink, ...WRAP_ANYWHERE }}>{clusterNavigatorLabel(previewNode)}</div>
            <div style={{ marginTop: 4, fontSize: 10, color: T.sub, ...WRAP_ANYWHERE }}>
              {previewNode.supportCount} comments
            </div>
          </div>
        ) : (
          <div data-cluster-preview="hidden" />
        )}
      </div>
    </div>
  );
}

function supportMetricIcon(kind: SelectedClusterSupportMetric["kind"]): string {
  switch (kind) {
    case "captured": return "◫";
    case "comments": return "◌";
    case "replies": return "↺";
    case "likes": return "like";
  }
}

function evidencePreview(text: string | undefined): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "No audience evidence text captured.";
  return value.length > 70 ? `${value.slice(0, 70).trimEnd()}…` : value;
}

function EvidenceFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: T.soft,
        letterSpacing: "0.06em",
        lineHeight: 1.4
      }}
    >
      {children}
    </span>
  );
}

function EvidenceFieldRow({
  label,
  children,
  borderTop = true
}: {
  label: string;
  children: React.ReactNode;
  borderTop?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px minmax(0, 1fr)",
        gap: 10,
        alignItems: "start",
        paddingTop: borderTop ? 8 : 0,
        borderTop: borderTop ? `1px solid ${T.line}` : "none",
        minWidth: 0
      }}
    >
      <EvidenceFieldLabel>{label}</EvidenceFieldLabel>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function CompareSelectorStrip({
  options,
  selectedA,
  selectedB,
  onChangeA,
  onChangeB
}: {
  options: CompareReadyItemOption[];
  selectedA: string;
  selectedB: string;
  onChangeA: (value: string) => void;
  onChangeB: (value: string) => void;
}) {
  const selectStyle = (side: "A" | "B") =>
    ({
      borderRadius: 999,
      border: `1px solid ${side === "A" ? T.accentBorder : T.warnBorder}`,
      padding: "8px 10px",
      fontSize: 12,
      fontWeight: 700,
      background: side === "A" ? T.accentSoft : T.warnSoft,
      minWidth: 0,
      boxSizing: "border-box"
    }) satisfies React.CSSProperties;

  return (
    <div
      data-compare-selector-strip="compact"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 28px 1fr",
        gap: 8,
        alignItems: "center"
      }}
    >
      <select value={selectedA} onChange={(e) => onChangeA(e.target.value)} style={selectStyle("A")}>
        {options.filter((item) => item.id !== selectedB).map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: T.soft }}>vs</div>
      <select value={selectedB} onChange={(e) => onChangeB(e.target.value)} style={selectStyle("B")}>
        {options.filter((item) => item.id !== selectedA).map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EvidenceReasonRow({
  sideLabel,
  detail,
  evidence,
  annotationMap
}: {
  sideLabel: "A" | "B";
  detail: SelectedClusterDetail;
  evidence: SelectedClusterDetail["audienceEvidence"][number];
  annotationMap: Map<string, EvidenceAnnotation>;
}) {
  const annotation = evidence.commentId ? annotationMap.get(evidence.commentId) : undefined;
  const emptyState = "（尚未個別分析此留言）";

  return (
    <div
      data-primary-evidence={`post-${sideLabel.toLowerCase()}`}
      style={{
        display: "grid",
        gridTemplateColumns: "84px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        padding: "12px 0",
        borderTop: `1px solid ${T.line}`,
        minWidth: 0
      }}
    >
      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "fit-content",
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            color: sideLabel === "A" ? T.accent : T.warn,
            background: sideLabel === "A" ? T.accentSoft : T.warnSoft,
            border: `1px solid ${sideLabel === "A" ? T.accentBorder : T.warnBorder}`
          }}
        >
          {`Post ${sideLabel}`}
        </span>
        <div style={{ fontSize: 10, color: T.soft, lineHeight: 1.5, ...WRAP_ANYWHERE }}>
          {detail.clusterTitle}
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        <blockquote
          style={{
            margin: 0,
            paddingLeft: 12,
            borderLeft: `3px solid ${sideLabel === "A" ? T.accentBorder : T.warnBorder}`,
            fontSize: 13,
            lineHeight: 1.65,
            color: T.ink
          }}
        >
          {evidence.text || "No audience evidence text captured."}
        </blockquote>
        <div style={{ display: "grid", gap: 8 }}>
          <EvidenceFieldRow label="Author" borderTop={false}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, ...WRAP_ANYWHERE }}>
              @{evidence.author || "anon"}
            </span>
          </EvidenceFieldRow>
          <EvidenceFieldRow label="Why matters">
            <span style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, ...WRAP_ANYWHERE }}>
              {annotation?.writerMeaning || emptyState}
            </span>
          </EvidenceFieldRow>
          <EvidenceFieldRow label="Relation">
            <span style={{ fontSize: 12, color: T.sub, lineHeight: 1.55, ...WRAP_ANYWHERE }}>
              {annotation?.whyEffective || emptyState}
            </span>
          </EvidenceFieldRow>
        </div>
        <div style={{ paddingTop: 2 }}>
          <EvidenceMetricRow
            metrics={{
              likes: evidence.likes,
              comments: evidence.comments,
              reposts: evidence.reposts,
              forwards: evidence.forwards
            }}
          />
        </div>
      </div>
    </div>
  );
}

function CompareJudgmentSheet({
  heroSummary,
  briefKeywords,
  detailA,
  detailB,
  aDirection,
  bDirection,
  compareBriefState,
  aiProviderConfigured,
  showAlertRail,
  annotationMap,
  onOpenTechnique
}: {
  heroSummary: CompareHeroSummary | null;
  briefKeywords: string[];
  detailA: SelectedClusterDetail | null;
  detailB: SelectedClusterDetail | null;
  aDirection: string | null;
  bDirection: string | null;
  compareBriefState: CompareBriefSurfaceState;
  aiProviderConfigured: boolean;
  showAlertRail: boolean;
  annotationMap: Map<string, EvidenceAnnotation>;
  onOpenTechnique: (side: "A" | "B") => void;
}) {
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [focusedKeyword, setFocusedKeyword] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const evidenceA = detailA?.audienceEvidence[0] || null;
  const evidenceB = detailB?.audienceEvidence[0] || null;
  const showTechnique = Boolean((detailA && evidenceA) || (detailB && evidenceB));
  const evidenceFilter = resolveEvidenceKeywordFilter(focusedKeyword, detailA, detailB, aDirection, bDirection);

  return (
    <div
      data-compare-analysis="sheet"
      data-alert-rail={showAlertRail ? "visible" : "hidden"}
      style={{
        display: "grid",
        gap: 18,
        padding: "18px 16px 16px",
        borderRadius: tokens.radius.lg,
        border: `1px solid ${T.line}`,
        background: `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`,
        boxShadow: tokens.shadow.glass,
        overflow: "hidden"
      }}
    >
      {heroSummary ? (
        <div
          id="dlens-section-brief"
          data-compare-hero="summary"
          data-compare-brief-state={compareBriefState}
          style={{ display: "grid", gap: 10 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, lineHeight: 1.35 }}>
                {heroSummary.headline}
              </div>
              <div
                data-compare-implication="cue"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  justifySelf: "start",
                  padding: "5px 9px",
                  borderRadius: tokens.radius.pill,
                  background: tokens.color.neutralSurfaceSoft,
                  border: `1px solid ${T.line}`,
                  fontSize: 11,
                  color: T.sub,
                  lineHeight: 1.45,
                  maxWidth: "100%"
                }}
              >
                <span style={{ fontWeight: 700, color: T.soft, whiteSpace: "nowrap" }}>創作提示</span>
                <span style={WRAP_ANYWHERE}>{heroSummary.cue}</span>
              </div>
              <div data-compare-keywords="visible" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {briefKeywords.slice(0, 5).map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    data-keyword-pill-style="ghost"
                    onClick={() => {
                      setFocusedKeyword((current) => current === keyword ? null : keyword);
                      setBriefExpanded(true);
                    }}
                    aria-pressed={focusedKeyword === keyword}
                    style={{
                      border: `1px solid ${focusedKeyword === keyword ? T.accentBorder : T.line}`,
                      borderRadius: tokens.radius.pill,
                      background: focusedKeyword === keyword ? T.accentSoft : "transparent",
                      color: focusedKeyword === keyword ? T.accent : T.sub,
                      padding: "4px 8px",
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: compareBriefState === "ready" ? T.success : compareBriefState === "loading" ? T.running : T.warn, whiteSpace: "nowrap" }}>
              {compareBriefState === "ready"
                ? "AI brief ready"
                : compareBriefState === "loading"
                  ? "Updating with AI..."
                  : aiProviderConfigured
                    ? "Deterministic fallback"
                    : "Local fallback"}
            </div>
          </div>

          <div data-author-stance-row="badge-row" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {([
              { label: "Post A", alignment: heroSummary.audienceAlignmentLeft, tone: T.accentSoft },
              { label: "Post B", alignment: heroSummary.audienceAlignmentRight, tone: T.warnSoft }
            ] as const).map((item) => (
              <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, padding: "7px 10px", borderRadius: tokens.radius.pill, background: item.tone, border: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: T.soft, letterSpacing: "0.03em", flexShrink: 0 }}>{item.label}</span>
                <span
                  title="Derived from visible cluster breadth and engagement concentration. This is a readable proxy, not a hard classifier."
                  data-alignment-badge-style="filled"
                  style={{ display: "inline-flex", alignItems: "center", padding: "3px 7px", borderRadius: tokens.radius.pill, fontSize: 10, fontWeight: 800, color: item.alignment.badge === "Align" ? T.success : item.alignment.badge === "Oppose" ? T.fail : T.warn, background: item.alignment.badge === "Align" ? T.successSoft : item.alignment.badge === "Oppose" ? T.failSoft : T.warnSoft, flexShrink: 0 }}
                >
                  {item.alignment.badge}
                </span>
              </div>
            ))}
          </div>

          <div data-compare-brief-body={briefExpanded ? "expanded" : "collapsed"} style={{ display: "grid", gap: 10 }}>
            <button
              type="button"
              onClick={() => setBriefExpanded((value) => !value)}
              style={{
                justifySelf: "start",
                border: `1px solid ${T.line}`,
                borderRadius: tokens.radius.pill,
                background: tokens.color.neutralSurfaceSoft,
                color: T.sub,
                padding: "5px 9px",
                fontSize: 10,
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              {briefExpanded ? "Hide full brief" : "Expand full brief"}
            </button>

            {briefExpanded ? (
              <div style={{ display: "grid", gap: 10 }}>
                {heroSummary.whyItMatters ? (
                  <div
                    data-compare-why-it-matters="visible"
                    style={{
                      borderLeft: `3px solid ${focusedKeyword ? T.accentSoft : T.line}`,
                      paddingLeft: 12,
                      fontSize: 12,
                      color: T.sub,
                      lineHeight: 1.6,
                      ...WRAP_ANYWHERE
                    }}
                  >
                    {heroSummary.whyItMatters}
                  </div>
                ) : null}
                <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
                  {detailA ? (
                    <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12 }}>
                      <SectionLabel color={T.accent}>A</SectionLabel>
                      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{aDirection || divergenceDirection(detailA, "A")}</div>
                    </div>
                  ) : null}
                  {detailB ? (
                    <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12 }}>
                      <SectionLabel color={T.warn}>B</SectionLabel>
                      <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{bDirection || divergenceDirection(detailB, "B")}</div>
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>
                    {heroSummary.creatorCue}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        <SectionLabel color={T.ink}>Receipts</SectionLabel>
        <div
          data-compare-evidence-ledger="stacked"
          data-evidence-filter={evidenceFilter.toLowerCase()}
          style={{
            display: "grid",
            gap: 0
          }}
        >
          {detailA && evidenceA && evidenceFilter !== "B" ? <EvidenceReasonRow sideLabel="A" detail={detailA} evidence={evidenceA} annotationMap={annotationMap} /> : null}
          {detailB && evidenceB && evidenceFilter !== "A" ? <EvidenceReasonRow sideLabel="B" detail={detailB} evidence={evidenceB} annotationMap={annotationMap} /> : null}
        </div>
      </div>

      {showTechnique ? (
        <div data-technique-gate="conditional" style={{ display: "grid", gap: 8, marginTop: 20 }}>
          <SectionLabel color={T.ink}>Technique</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {detailA && evidenceA ? (
              <button
                type="button"
                onClick={() => onOpenTechnique("A")}
                style={{ borderRadius: tokens.radius.pill, border: `1px solid ${T.accentBorder}`, background: T.accentSoft, padding: "7px 11px", fontSize: 11, fontWeight: 700, color: T.accent, cursor: "pointer" }}
              >
                Open Post A reading
              </button>
            ) : null}
            {detailB && evidenceB ? (
              <button
                type="button"
                onClick={() => onOpenTechnique("B")}
                style={{ borderRadius: tokens.radius.pill, border: `1px solid ${T.warnBorder}`, background: T.warnSoft, padding: "7px 11px", fontSize: 11, fontWeight: 700, color: T.warn, cursor: "pointer" }}
              >
                Open Post B reading
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        <SectionLabel color={T.ink}>A/B divergence</SectionLabel>
        <div
          data-compare-divergence="visible"
          style={{
            display: "grid",
            gap: 0
          }}
        >
          {detailA ? (
            <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12, alignItems: "start", padding: "12px 0" }}>
              <SectionLabel color={T.accent}>A</SectionLabel>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{aDirection || divergenceDirection(detailA, "A")}</div>
            </div>
          ) : null}
          {detailB ? (
            <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12, alignItems: "start", padding: "12px 0", borderTop: `1px solid ${T.line}` }}>
              <SectionLabel color={T.warn}>B</SectionLabel>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{bDirection || divergenceDirection(detailB, "B")}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
        <button
          type="button"
          onClick={() => setExportMessage("Developing")}
          style={{
            borderRadius: tokens.radius.pill,
            border: `1px solid ${T.line}`,
            background: tokens.color.neutralSurfaceSoft,
            color: T.sub,
            padding: "7px 11px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Export full report
        </button>
        <span style={{ fontSize: 10, color: T.soft }}>
          {exportMessage || "Developing"}
        </span>
      </div>
    </div>
  );
}

function AudienceDetailPanel({
  detail,
  sideLabel,
  expandedEvidenceKeys,
  onToggleEvidence,
  onOpenTechnique,
  detailRef,
  highlighted
}: {
  detail: SelectedClusterDetail | null;
  sideLabel: "A" | "B" | null;
  expandedEvidenceKeys: Set<string>;
  onToggleEvidence: (key: string) => void;
  onOpenTechnique?: (() => void) | null;
  detailRef?: React.RefObject<HTMLDivElement | null>;
  highlighted?: boolean;
}) {
  if (!detail || !sideLabel) {
    return (
      <div data-cluster-detail="empty" style={{ padding: "18px 16px", borderRadius: 12, border: `1px solid ${T.line}`, background: tokens.color.elevated, boxShadow: tokens.shadow.glass }}>
        <SectionLabel>Select a cluster</SectionLabel>
        <div style={{ marginTop: 6, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>
          Hover 只做預覽；點擊 bubble 才會鎖定這個群組，先看 audience evidence，再看作者摘要與對側相近群組。
        </div>
      </div>
    );
  }

  return (
    <div
      ref={detailRef}
      id={`dlens-selected-cluster-${sideLabel.toLowerCase()}`}
      data-cluster-detail="selected"
      data-jump-highlight={highlighted ? "true" : "false"}
      style={{
        padding: "16px 16px 14px",
        borderRadius: 12,
        border: highlighted ? `1.5px solid ${sideLabel === "A" ? T.accentBorder : T.warnBorder}` : `1px solid ${T.line}`,
        background: tokens.color.elevated,
        boxShadow: highlighted
          ? `0 0 0 3px ${sideLabel === "A" ? T.accentSoft : T.warnSoft}, ${tokens.shadow.glass}`
          : tokens.shadow.glass,
        display: "grid",
        gap: 12,
        transition: tokens.motion.interactiveTransition
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ ...WRAP_ANYWHERE }}>
          <SectionLabel>{`Selected Cluster · Post ${sideLabel}`}</SectionLabel>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: T.ink, ...WRAP_ANYWHERE }}>{detail.clusterTitle}</div>
          <div style={{ marginTop: 5, fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{detail.thesis}</div>
        </div>
        {onOpenTechnique ? (
          <div>
            <button
              type="button"
              onClick={onOpenTechnique}
              style={{
                borderRadius: 999,
                border: `1px solid ${T.line}`,
                background: tokens.color.neutralSurfaceSoft,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                color: T.accent,
                cursor: "pointer"
              }}
            >
              Deeper reading →
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <SectionLabel>Audience evidence</SectionLabel>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <TopEvidenceStrip sideLabel={sideLabel} detail={detail} onJump={() => detailRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          {detail.audienceEvidence.length > 1 ? detail.audienceEvidence.slice(1, 4).map((evidence, index) => (
            (() => {
              const evidenceKey = `${sideLabel}:${evidence.commentId || index + 1}`;
              const expanded = expandedEvidenceKeys.has(evidenceKey);
              return (
                <button
                  key={evidence.commentId || index}
                  type="button"
                  onClick={() => onToggleEvidence(evidenceKey)}
                  data-evidence-card-layout="field-rows"
                  style={{
                    borderRadius: 12,
                    background: tokens.color.neutralSurfaceSoft,
                    border: `1px solid ${T.line}`,
                    padding: "11px 12px",
                    display: "grid",
                    gap: 8,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: tokens.motion.interactiveTransition
                  }}
                >
                  <EvidenceFieldRow label="Author" borderTop={false}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, ...WRAP_ANYWHERE }}>@{evidence.author || "anon"}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: T.soft, ...WRAP_ANYWHERE }}>{evidence.commentId || "evidence"}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>{expanded ? "Hide evidence" : "Show evidence"}</span>
                      </span>
                    </div>
                  </EvidenceFieldRow>
                  <EvidenceFieldRow label="Excerpt">
                    <span style={{ fontSize: 12, lineHeight: 1.55, color: T.ink, ...WRAP_ANYWHERE }}>
                      {expanded ? (evidence.text || "No audience evidence text captured.") : evidencePreview(evidence.text)}
                    </span>
                  </EvidenceFieldRow>
                  <div style={{ paddingTop: 6, borderTop: `1px solid ${T.line}` }}>
                    <EvidenceMetricRow
                      metrics={{
                        likes: evidence.likes,
                        comments: evidence.comments,
                        reposts: evidence.reposts,
                        forwards: evidence.forwards
                      }}
                    />
                  </div>
                </button>
              );
            })()
          )) : (
            detail.audienceEvidence.length === 0 ? (
              <div style={{ fontSize: 12, color: T.soft }}>Low-signal cluster. Not enough audience evidence yet.</div>
            ) : null
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {detail.supportMetrics.map((metric) => (
          <span
            key={`${metric.kind}:${metric.value}`}
            style={{
              fontSize: 11,
              color: T.sub,
              background: tokens.color.neutralSurfaceSoft,
              border: `1px solid ${T.line}`,
              borderRadius: 999,
              padding: "5px 9px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              ...WRAP_ANYWHERE
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: metric.kind === "likes" ? T.fail : metric.kind === "replies" ? T.accent : T.soft }}>
              {supportMetricIcon(metric.kind)}
            </span>
            <span style={{ fontWeight: 700, color: T.ink }}>{metric.value}</span>
            <span style={{ color: T.soft }}>{metric.label}</span>
          </span>
        ))}
      </div>

      {/* Compact meta strip — author stance · alignment · related cluster */}
      <div style={{ borderRadius: 8, border: `1px solid ${T.line}`, background: tokens.color.neutralSurfaceSoft, overflow: "hidden" }}>
        {/* Row 1: alignment badge + stance excerpt */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
          <span
            title="Derived from visible cluster breadth and engagement concentration. This is a readable proxy, not a hard classifier."
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 7px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              color: detail.alignment === "Align" ? T.success : detail.alignment === "Oppose" ? T.fail : T.warn,
              background: detail.alignment === "Align" ? T.successSoft : detail.alignment === "Oppose" ? T.failSoft : T.warnSoft
            }}
          >
            {detail.alignment}
          </span>
          <span style={{ fontSize: 11, color: T.sub, lineHeight: 1.5, ...WRAP_ANYWHERE }}>{detail.authorStance}</span>
        </div>
        {/* Divider */}
        <div style={{ height: 1, background: T.line }} />
        {/* Row 2: related cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.soft, letterSpacing: "0.02em", flexShrink: 0 }}>
            {`Post ${sideLabel === "A" ? "B" : "A"}`}
          </span>
          {detail.relatedCluster ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, ...WRAP_ANYWHERE }}>{detail.relatedCluster.title}</span>
              <span style={{ fontSize: 10, color: T.soft, flexShrink: 0 }}>· {detail.relatedCluster.supportLabel}</span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: T.soft }}>No clear related cluster</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CompareSectionRail({
  onScrollClusters,
  onScrollEngagement,
  onScrollComments
}: {
  onScrollClusters: () => void;
  onScrollEngagement: () => void;
  onScrollComments: () => void;
}) {
  const buttonStyle = {
    border: `1px solid ${T.line}`,
    borderRadius: 999,
    background: tokens.color.neutralSurfaceSoft,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 700,
    color: T.sub,
    cursor: "pointer"
  } satisfies React.CSSProperties;

  return (
    <div
      data-compare-section-rail="sticky"
      style={{
        position: "sticky",
        top: 8,
        zIndex: 3,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        padding: "10px 12px",
        borderRadius: 999,
        border: `1px solid ${T.line}`,
        background: tokens.color.elevated,
        boxShadow: tokens.shadow.glass,
        backdropFilter: "blur(8px)"
      }}
    >
      <button type="button" onClick={onScrollClusters} style={buttonStyle}>Clusters</button>
      <button type="button" onClick={onScrollEngagement} style={buttonStyle}>Engagement</button>
      <button type="button" onClick={onScrollComments} style={buttonStyle}>Comments</button>
    </div>
  );
}

function TopEvidenceStrip({
  sideLabel,
  detail,
  onJump
}: {
  sideLabel: "A" | "B";
  detail: SelectedClusterDetail | null;
  onJump: () => void;
}) {
  const evidence = detail?.audienceEvidence[0] || null;
  if (!detail || !evidence) return null;

  return (
    <button
      type="button"
      onClick={onJump}
      data-top-evidence={`post-${sideLabel.toLowerCase()}`}
      data-top-evidence-section="visible"
      data-evidence-card-layout="field-rows"
      style={{
        borderRadius: 12,
        border: `1px solid ${T.line}`,
        background: tokens.color.neutralSurfaceSoft,
        padding: "12px 13px",
        display: "grid",
        gap: 8,
        textAlign: "left",
        cursor: "pointer",
        transition: tokens.motion.interactiveTransition
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <SectionLabel color={sideLabel === "A" ? T.accent : T.warn}>{`Top evidence · Post ${sideLabel}`}</SectionLabel>
        <span style={{ fontSize: 10, color: T.soft }}>Jump to cluster</span>
      </div>
      <EvidenceFieldRow label="Author" borderTop={false}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, ...WRAP_ANYWHERE }}>{evidence.author ? `@${evidence.author}` : "@anon"}</span>
          <span style={{ fontSize: 10, color: T.soft, ...WRAP_ANYWHERE }}>{detail.clusterTitle}</span>
        </div>
      </EvidenceFieldRow>
      <EvidenceFieldRow label="Excerpt">
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>
          {evidencePreview(evidence.text)}
        </div>
      </EvidenceFieldRow>
      <EvidenceFieldRow label="Metrics">
        <EvidenceMetricRow
          metrics={{
            likes: evidence.likes,
            comments: evidence.comments,
            reposts: evidence.reposts,
            forwards: evidence.forwards
          }}
        />
      </EvidenceFieldRow>
    </button>
  );
}

/* ── Analysis summary strip ── */

function AnalysisSummaryStrip({
  label,
  analysis,
  color,
  visibleCount,
  evidenceCount
}: {
  label: string;
  analysis: AnalysisSnapshot | null;
  color: string;
  visibleCount: number;
  evidenceCount: number;
}) {
  const m = analysisMetrics(analysis);
  if (!analysis) return null;
  const countLabel = visibleClusterCountLabel(visibleCount);
  const hiddenLabel = hiddenClusterCountLabel(m.nClusters, visibleCount);
  return (
    <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.5, ...WRAP_ANYWHERE }}>
      <span style={{ fontWeight: 800, color }}>{label}</span>{" "}
      {countLabel}
      {m.dominance != null ? ` · ${getDominanceLabel(m.dominance)}(${(m.dominance * 100).toFixed(0)}%)` : ""}
      {" · "}{analysis.source_comment_count ?? "?"} comments captured
      {evidenceCount > 0 ? ` · ${evidenceCount} evidence surfaced` : ""}
      {hiddenLabel ? ` · ${hiddenLabel}` : ""}
    </div>
  );
}

/* ── Top comments expandable ── */

function TopComments({ comments, label, bgColor }: { comments: CommentData[]; label: string; bgColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? comments.slice(0, 10) : comments.slice(0, 2);
  if (comments.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <SectionLabel>{label} ({comments.length})</SectionLabel>
        {comments.length > 2 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none", border: "none", fontSize: 11, fontWeight: 700,
              color: T.accent, cursor: "pointer", padding: 0
            }}
          >
            {expanded ? "Show less" : `+${comments.length - 2} more`}
          </button>
        ) : null}
      </div>
      {shown.map((comment, i) => (
        <div key={comment.comment_id || i} style={{
          padding: "7px 10px",
          borderRadius: tokens.radius.card,
          overflow: "hidden",
          background: bgColor,
          fontSize: 11,
          lineHeight: 1.45
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: T.ink, ...WRAP_ANYWHERE }}>@{comment.author || "anon"}</span>
            {comment.like_count != null ? <span style={{ color: T.soft }}>{comment.like_count} likes</span> : null}
          </div>
          <div style={{
            color: T.sub,
            display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2, overflow: "hidden"
          }}>
            {comment.text || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompareUnavailableBridge({
  readiness,
  onGoToLibrary
}: {
  readiness: CompareReadinessViewModel;
  onGoToLibrary?: () => void;
}) {
  const { analyzingCount, inflightCount, pendingItem, pendingStatus, explanation } = readiness;

  return (
    <div
      data-compare-bridge="unavailable"
      style={{
        display: "grid",
        gap: 10,
        padding: "18px 16px 16px",
        borderRadius: 12,
        background: `linear-gradient(180deg, ${tokens.color.focusedSurface}, ${tokens.color.contentSurface})`,
        border: `1px solid ${T.line}`,
        boxShadow: tokens.shadow.glass
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <SectionLabel>Compare</SectionLabel>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, lineHeight: 1.4 }}>
          Compare needs two ready posts.
        </div>
        <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{explanation}</div>
      </div>

      <div
        data-result-hero-skeleton="visible"
        data-result-hero-pending-status={pendingStatus || "idle"}
        style={{
          display: "grid",
          gap: 12,
          padding: "15px 15px 14px",
          borderRadius: 12,
          background: AR.card,
          boxShadow: COMPARE_CARD_SHADOW
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: tokens.color.neutralSurfaceSoft, borderRadius: 999, padding: "4px 9px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: analyzingCount > 0 ? T.running : T.warn, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.sub }}>Result pending</span>
          </div>
          {pendingItem ? (
            <div style={{ fontSize: 10, color: T.soft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              @{pendingItem.authorLabel}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span style={skeletonBlockStyle("72%", 16)} />
          <span style={skeletonBlockStyle("94%", 10)} />
          <span style={skeletonBlockStyle("86%", 10)} />
        </div>

        <div data-compare-bridge-skeleton="visible" style={{ display: "flex", gap: 8 }}>
          {["46%", "30%"].map((width, index) => (
            <span key={index} style={skeletonBlockStyle(width, 26, { borderRadius: 999 })} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: `2px solid ${T.line}`,
            borderTopColor: analyzingCount > 0 ? T.running : inflightCount > 0 ? T.warn : T.soft,
            animation: (analyzingCount > 0 || inflightCount > 0) ? "dlens-pulse 1.6s ease-in-out infinite" : undefined,
            flexShrink: 0
          }}
        />
        <div style={{ display: "grid", gap: 6, flex: 1 }}>
          {["64%", "52%"].map((width, index) => (
            <span
              key={index}
              style={skeletonBlockStyle(width, 6)}
            />
          ))}
        </div>
      </div>

      <div>
          <PrimaryButton onClick={() => onGoToLibrary?.()} style={{ minWidth: 132 }}>
          Go to Library
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   APPLE-STYLE RESULT READING VIEW
   ══════════════════════════════════════════════════════ */

const AR = {
  blue: tokens.color.accent,
  orange: tokens.color.queued,
  green: tokens.color.success,
  ink: tokens.color.ink,
  canvas: tokens.color.contentSurface,
  card: tokens.color.elevated,
  softInk: tokens.color.subInk,
  muteInk: tokens.color.softInk,
  dimInk: tokens.color.softInk,
  line: tokens.color.line,
  lineStrong: tokens.color.lineStrong,
} as const;

function ARSparkle({ color = AR.blue, size = 10 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2L13.8 9.2L21 11L13.8 12.8L12 20L10.2 12.8L3 11L10.2 9.2L12 2Z"/>
    </svg>
  );
}

function ARChevron({ open }: { open: boolean }) {
  return (
    <svg width="11" height="7" viewBox="0 0 11 7" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s" }}>
      <path d="M1 1L5.5 6L10 1" stroke={AR.dimInk} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Flowing Cluster Viz (copied from mockup) ── */

interface ARDot {
  id: number; cx: number; cy: number; r: number;
  cluster: "A" | "B" | "C"; mass: number;
  phaseX: number;
  phaseY: number;
  idleAmpX: number;
  idleAmpY: number;
  maxDrift: number;
}

const AR_BASE_DOTS: ARDot[] = [
  ...([...Array(22)].map((_, i) => ({
    id: i,
    cx: 38 + Math.cos(i * 0.62 + 0.3) * (8 + (i % 4) * 5.5) + (i % 3) * 1.5,
    cy: 50 + Math.sin(i * 0.62 + 0.3) * (7 + (i % 4) * 4.5),
    r: i < 3 ? 3.9 : i < 8 ? 3.1 : 2.05,
    cluster: "A" as const,
    mass: i < 3 ? 3 : i < 8 ? 2 : 1,
    phaseX: i * 0.41 + 0.3,
    phaseY: i * 0.27 + 1.1,
    idleAmpX: i < 3 ? 1.1 : i < 8 ? 1.5 : 1.8,
    idleAmpY: i < 3 ? 0.95 : i < 8 ? 1.3 : 1.55,
    maxDrift: i < 3 ? 3.1 : i < 8 ? 4.1 : 4.7,
  }))),
  ...([...Array(13)].map((_, i) => ({
    id: 22 + i,
    cx: 108 + Math.cos(i * 0.9 + 1) * (7 + (i % 3) * 5),
    cy: 45 + Math.sin(i * 0.9 + 1) * (6 + (i % 3) * 4.5),
    r: i < 2 ? 3.7 : i < 5 ? 2.9 : 1.95,
    cluster: "B" as const,
    mass: i < 2 ? 3 : i < 5 ? 2 : 1,
    phaseX: i * 0.36 + 0.9,
    phaseY: i * 0.22 + 2.2,
    idleAmpX: i < 2 ? 1 : i < 5 ? 1.45 : 1.75,
    idleAmpY: i < 2 ? 0.9 : i < 5 ? 1.2 : 1.55,
    maxDrift: i < 2 ? 3 : i < 5 ? 3.9 : 4.4,
  }))),
  ...([...Array(7)].map((_, i) => ({
    id: 35 + i,
    cx: 68 + (i % 4) * 16 + Math.cos(i * 1.4) * 5,
    cy: 82 + Math.sin(i * 1.4) * 6,
    r: 1.8,
    cluster: "C" as const,
    mass: 1,
    phaseX: i * 0.53 + 0.4,
    phaseY: i * 0.31 + 1.7,
    idleAmpX: 1.6,
    idleAmpY: 1.2,
    maxDrift: 4.2,
  }))),
];

const AR_CLUSTER_COLORS: Record<string, string> = {
  A: AR.blue,
  B: AR.orange,
  C: AR.green,
};

function FlowingClusterViz() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [offsets, setOffsets] = useState<{ x: number; y: number }[]>(AR_BASE_DOTS.map(() => ({ x: 0, y: 0 })));
  const rafRef = useRef<number>(0);
  const currentOffsets = useRef(offsets);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const isReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const animate = useCallback((now: number) => {
    const time = now / 1000;
    const pointer = pointerRef.current;
    const pointerActive = Boolean(pointer);

    const next = currentOffsets.current.map((cur, i) => {
      const dot = AR_BASE_DOTS[i]!;
      const idleX =
        Math.sin(time * 0.7 + dot.phaseX) * dot.idleAmpX
        + Math.cos(time * 0.33 + dot.phaseY) * (dot.idleAmpX * 0.35);
      const idleY =
        Math.cos(time * 0.62 + dot.phaseY) * dot.idleAmpY
        + Math.sin(time * 0.28 + dot.phaseX) * (dot.idleAmpY * 0.32);

      let interactionX = 0;
      let interactionY = 0;

      if (pointer) {
        const dx = dot.cx - pointer.x;
        const dy = dot.cy - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = dot.cluster === "C" ? 22 : 29;
        if (dist < radius && dist > 0.0001) {
          const force = Math.pow(1 - dist / radius, 2);
          const strength = (dot.cluster === "C" ? 5.8 : 8.2) * force / (0.9 + dot.mass * 0.75);
          interactionX = (dx / dist) * strength;
          interactionY = (dy / dist) * strength;
        }
      }

      let tx = idleX + interactionX;
      let ty = idleY + interactionY;
      const drift = Math.sqrt(tx * tx + ty * ty);
      if (drift > dot.maxDrift) {
        const scale = dot.maxDrift / drift;
        tx *= scale;
        ty *= scale;
      }

      const easing = pointerActive ? 0.14 : 0.075;
      return {
        x: cur.x + (tx - cur.x) * easing,
        y: cur.y + (ty - cur.y) * easing
      };
    });
    currentOffsets.current = next;
    setOffsets([...next]);
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isReduced) return;
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate, isReduced]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isReduced || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 168 / rect.width;
    const scaleY = 112 / rect.height;
    pointerRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, [isReduced]);

  const handleMouseLeave = useCallback(() => {
    pointerRef.current = null;
  }, []);

  return (
    <div style={{ background: AR.canvas, borderRadius: 12, padding: "10px 8px 6px", cursor: "crosshair" }}>
      <svg ref={svgRef} width="100%" viewBox="0 0 168 112" style={{ display: "block" }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        {AR_BASE_DOTS.map((d, i) => (
          <circle key={d.id}
            cx={d.cx + (offsets[i]?.x ?? 0)}
            cy={d.cy + (offsets[i]?.y ?? 0)}
            r={d.r}
            fill={AR_CLUSTER_COLORS[d.cluster] ?? AR_CLUSTER_COLORS["A"]!}
            style={{
              filter: d.r > 3.4 ? `drop-shadow(0 0.6px 1.8px ${tokens.color.lineStrong})` : "none",
              opacity: d.cluster === "C" ? 0.78 : 0.9
            }}
          />
        ))}
        <g transform="translate(11,94)">
          <rect width="34" height="10" rx="5" fill={tokens.color.accentSoft} />
          <text x="17" y="7.1" textAnchor="middle" fontSize="7" fill={AR.blue} fontWeight="700">群組 A</text>
        </g>
        <g transform="translate(103,94)">
          <rect width="34" height="10" rx="5" fill={tokens.color.queuedSoft} />
          <text x="17" y="7.1" textAnchor="middle" fontSize="7" fill={AR.orange} fontWeight="700">群組 B</text>
        </g>
        <g transform="translate(59,94)">
          <rect width="22" height="10" rx="5" fill={tokens.color.successSoft} />
          <text x="11" y="7.1" textAnchor="middle" fontSize="6.8" fill={AR.green} fontWeight="700">其他</text>
        </g>
      </svg>
      <p style={{ fontSize: 9.5, color: AR.dimInk, textAlign: "center", margin: "2px 0 0", letterSpacing: 0 }}>
        每個點代表一則留言 · 平時慢速漂移，靠近時出現局部場域偏移
      </p>
    </div>
  );
}

/* ── Result: Hero Reading Card ── */

function ResultHeroCard({
  heroSummary,
  brief,
  postA,
  postB,
  compareBriefState,
  briefProvenanceLabel,
}: {
  heroSummary: CompareHeroSummary | null;
  brief: CompareBrief | null;
  postA: PostData | null;
  postB: PostData | null;
  compareBriefState: "idle" | "loading" | "ready" | "fallback";
  briefProvenanceLabel: string;
}) {
  if (!heroSummary) return null;
  const briefBadgeColor = compareBriefState === "ready" ? COMPARE_MODE_ACCENT : compareBriefState === "loading" ? T.running : T.soft;
  const confidenceLabel = brief?.confidence ? `CONF · ${String(brief.confidence).toUpperCase()}` : "CONF · MEDIUM";
  const briefLabel = compareBriefState === "loading" ? "生成中…" : `${briefProvenanceLabel} · ${confidenceLabel}`;
  const verdictLabel = heroSummary.audienceAlignmentLeft.badge === "Align" && heroSummary.audienceAlignmentRight.badge === "Align" ? "共鳴放大型"
    : heroSummary.audienceAlignmentLeft.badge === "Oppose" || heroSummary.audienceAlignmentRight.badge === "Oppose" ? "分歧探索型"
    : "張力並存型";
  const stanceItems = [
    {
      side: "A" as const,
      post: postA,
      alignment: heroSummary.audienceAlignmentLeft,
      accent: COMPARE_MODE_ACCENT,
      surface: COMPARE_MODE_ACCENT_SOFT
    },
    {
      side: "B" as const,
      post: postB,
      alignment: heroSummary.audienceAlignmentRight,
      accent: AR.orange,
      surface: tokens.color.queuedSoft
    }
  ];
  return (
    <section
      data-compare-hero="billboard"
      data-compare-brief-state={compareBriefState}
      data-compare-raised-surface="true"
      data-compare-hero-accent="mode-var"
      style={{
        position: "relative",
        display: "grid",
        gap: 14,
        background: `linear-gradient(135deg, ${tokens.color.elevated} 0%, ${tokens.color.contentSurface} 56%, ${COMPARE_MODE_ACCENT_SOFT} 100%)`,
        borderRadius: tokens.radius.cardLg,
        padding: "19px 18px 17px",
        border: `1px solid ${COMPARE_MODE_ACCENT_GLOW}`,
        boxShadow: tokens.shadow.raised,
        minWidth: 0,
        overflow: "hidden"
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0 auto 0 0",
          width: 4,
          background: `linear-gradient(180deg, ${COMPARE_MODE_ACCENT}, ${COMPARE_MODE_ACCENT_MID})`
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" as const, minWidth: 0, paddingLeft: 2 }}>
        <div
          data-compare-hero-verdict="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: COMPARE_MODE_ACCENT_SOFT,
            border: `1px solid ${COMPARE_MODE_ACCENT_GLOW}`,
            borderRadius: tokens.radius.pill,
            padding: "4px 10px",
            minWidth: 0
          }}
        >
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: COMPARE_MODE_ACCENT, flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, fontWeight: 800, color: COMPARE_MODE_ACCENT, ...WRAP_ANYWHERE }}>
            {verdictLabel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
          <ARSparkle color={briefBadgeColor} />
          <span style={{ fontSize: 10.5, color: briefBadgeColor, fontWeight: 700, ...WRAP_ANYWHERE }}>
            {briefLabel}
          </span>
        </div>
      </div>

      <h1
        data-compare-hero-headline="true"
        style={{
          fontFamily: `${tokens.font.serif}, ${tokens.font.serifCjk}`,
          fontSize: 27,
          fontWeight: 700,
          lineHeight: 1.18,
          letterSpacing: 0,
          color: AR.ink,
          margin: 0,
          ...WRAP_ANYWHERE
        }}
      >
        {heroSummary.headline}
      </h1>

      {heroSummary.relation ? (
        <div
          data-compare-hero-relation="true"
          style={{
            display: "grid",
            gap: 5,
            padding: "11px 12px",
            borderRadius: tokens.radius.card,
            background: tokens.color.contextSurface,
            border: `1px solid ${AR.line}`,
            minWidth: 0
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>
            判讀關係
          </span>
          <p style={{ fontSize: 12.5, lineHeight: 1.58, letterSpacing: 0, color: AR.softInk, margin: 0, ...WRAP_ANYWHERE }}>
            {heroSummary.relation}
          </p>
        </div>
      ) : null}

      {(postA || postB) && (
        <div
          data-compare-stance-grid="responsive"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
            minWidth: 0
          }}
        >
          {stanceItems.map(({ side, post, alignment, accent, surface }) => (
            <div
              key={side}
              data-compare-stance-cell={side}
              style={{
                display: "grid",
                gridTemplateColumns: "30px minmax(0, 1fr)",
                gap: 8,
                alignItems: "start",
                background: surface,
                border: `1px solid ${side === "A" ? COMPARE_MODE_ACCENT_GLOW : T.warnBorder}`,
                borderLeft: `3px solid ${side === "A" ? COMPARE_MODE_ACCENT : AR.orange}`,
                borderRadius: tokens.radius.card,
                padding: "9px 10px",
                minWidth: 0,
                overflowWrap: "anywhere" as const,
                wordBreak: "break-word" as const
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: `linear-gradient(135deg, ${accent}, ${side === "A" ? COMPARE_MODE_ACCENT_MID : tokens.topicAccent.tintAmber})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: 9, color: tokens.color.elevated, fontWeight: 850 }}>貼{side}</span>
              </div>
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" as const, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: accent }}>{alignment.badge}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: AR.ink, ...WRAP_ANYWHERE }}>@{post?.author || "unknown"}</span>
                </div>
                <div style={{ fontSize: 11.5, color: AR.softInk, lineHeight: 1.45, ...WRAP_ANYWHERE }}>
                  {alignment.summary}
                </div>
                <div style={{ fontSize: 10.5, color: AR.muteInk, lineHeight: 1.4, ...WRAP_ANYWHERE }}>
                  {post?.text ? `「${post.text.slice(0, 34)}${post.text.length > 34 ? "..." : ""}」` : "No post text"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, paddingTop: 2, minWidth: 0 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: AR.muteInk, paddingTop: 2, whiteSpace: "nowrap", letterSpacing: 0 }}>為何成立</span>
        <p style={{ fontSize: 12, lineHeight: 1.47, letterSpacing: 0, color: AR.softInk, margin: 0, ...WRAP_ANYWHERE }}>
          {heroSummary.creatorCue}
        </p>
      </div>
    </section>
  );
}

/* ── Result: Multi-Cluster Balance Card ── */

function ResultBalanceCard({
  leftSummaries,
  rightSummaries,
  leftSurfaces,
  rightSurfaces,
  capturedA,
  capturedB,
  activeTab,
  onTabChange,
}: {
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  capturedA: number;
  capturedB: number;
  activeTab: "A" | "B";
  onTabChange: (tab: "A" | "B") => void;
}) {
  const activeSummaries = (activeTab === "A" ? leftSummaries : rightSummaries).slice(0, 3);
  const activeSurfaces = activeTab === "A" ? leftSurfaces : rightSurfaces;
  if (activeSummaries.length === 0) return null;

  const clusterColors = [AR.blue, AR.orange, AR.green];
  const clusterNarrative = ["主流", "高互動", "分散"];

  // Use raw supportCount in flex so rounding never creates gaps
  const totalCount = activeSummaries.reduce((sum, s) => sum + s.supportCount, 0);
  const displayTotal = totalCount || (activeTab === "A" ? capturedA : capturedB);
  const bars = activeSummaries.map((s, i) => ({
    count: s.supportCount || 1,
    pct: totalCount > 0 ? Math.round((s.supportCount / totalCount) * 100) : Math.round(s.cluster.size_share * 100),
    color: clusterColors[i] ?? AR.blue,
  }));

  // Tension note: dominant vs. high-engagement cluster titles
  const tensionText = (() => {
    if (activeSummaries.length < 2) return "各群組互動模式呈現差異";
    const t0 = activeSurfaces[0]?.title || activeSummaries[0]!.cluster.keywords[0] || "群組 1";
    const t1 = activeSurfaces[1]?.title || activeSummaries[1]!.cluster.keywords[0] || "群組 2";
    const ratio0 = activeSummaries[0]!.cluster.like_share / (activeSummaries[0]!.cluster.size_share + 0.001);
    const ratio1 = activeSummaries[1]!.cluster.like_share / (activeSummaries[1]!.cluster.size_share + 0.001);
    const highEng = ratio0 > ratio1 ? t0 : t1;
    const dominant = activeSummaries[0]!.cluster.size_share >= activeSummaries[1]!.cluster.size_share ? t0 : t1;
    if (dominant === highEng) return `「${dominant}」在數量與互動上均佔主導`;
    return `「${dominant}」數量最多，但「${highEng}」的互動質量更高`;
  })();

  return (
    <div style={{ background: AR.card, borderRadius: 12, overflow: "hidden", boxShadow: COMPARE_CARD_SHADOW }}>
      {/* Header + toggle */}
      <div style={{ padding: "11px 14px 9px", borderBottom: `0.5px solid ${AR.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.22 }}>留言區聲量結構</span>
          <span style={{ fontSize: 10, color: AR.dimInk }}>{displayTotal} 則 · {activeSummaries.length} 群組</span>
        </div>
        <div style={{ display: "flex", background: tokens.color.neutralSurfaceSoft, borderRadius: 7, padding: 2 }}>
          {(["A", "B"] as const).map(t => (
            <button key={t} onClick={() => onTabChange(t)} style={{
              flex: 1, padding: "4px 0", borderRadius: 5, border: "none",
              background: activeTab === t ? AR.card : "transparent",
              boxShadow: activeTab === t ? COMPARE_ACTIVE_CONTROL_SHADOW : "none",
              fontSize: 11, fontWeight: 600,
              color: activeTab === t ? (t === "A" ? AR.blue : AR.orange) : AR.muteInk,
              cursor: "pointer",
            }}>
              貼 {t}
            </button>
          ))}
        </div>
      </div>

      {/* Cluster columns */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${AR.line}` }}>
        {activeSummaries.map((s, i) => {
          const surface = activeSurfaces[i];
          const title = surface?.title || s.cluster.keywords.slice(0, 2).join("・") || "—";
          const cc = clusterColors[i] ?? AR.blue;
          return (
            <div key={i} style={{ flex: 1, padding: "8px 10px 12px", borderRight: i < activeSummaries.length - 1 ? `0.5px solid ${AR.line}` : "none", minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: cc, letterSpacing: 0, marginBottom: 4 }}>
                群 {i + 1}
              </div>
              <div style={{ fontFamily: tokens.font.sans, fontSize: 26, fontWeight: 700, color: AR.ink, lineHeight: 1, letterSpacing: 0 }}>
                {bars[i]?.pct ?? 0}<span style={{ fontSize: 13, fontWeight: 500 }}>%</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: AR.ink, marginTop: 3, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title}
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: cc, fontWeight: 700, background: `${cc}14`, borderRadius: 4, padding: "1.5px 5px", display: "inline-block" }}>
                {clusterNarrative[i] ?? "分散"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Proportional segment bar using raw counts to avoid rounding gaps */}
      <div style={{ display: "flex", height: 4, overflow: "hidden" }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: b.count, background: b.color, opacity: 0.8, minWidth: 0 }} />
        ))}
      </div>

      {/* Tension note */}
      <div style={{ padding: "9px 17px 12px", minWidth: 0 }}>
        <p style={{ fontSize: 11, color: AR.softInk, lineHeight: 1.45, letterSpacing: 0, margin: 0, ...WRAP_ANYWHERE }}>
          <span style={{ fontWeight: 700, color: AR.ink }}>主要張力：</span>
          {tensionText}
        </p>
      </div>
    </div>
  );
}

/* ── Result: Evidence Tabs ── */

function ResultEvidenceSection({
  leftSurfaces,
  rightSurfaces,
  annotationMap,
  tab,
  onTabChange,
}: {
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  annotationMap: Map<string, EvidenceAnnotation>;
  tab: "A" | "B";
  onTabChange: (tab: "A" | "B") => void;
}) {
  const topA = leftSurfaces[0] || null;
  const topB = rightSurfaces[0] || null;
  const evidencesA = topA?.audienceEvidence.slice(0, 2) ?? [];
  const evidencesB = topB?.audienceEvidence.slice(0, 2) ?? [];

  if (evidencesA.length === 0 && evidencesB.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12, padding: "0 2px" }}>
        <span style={{ fontFamily: tokens.font.sans, fontSize: 18, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>代表性原文</span>
      </div>
      <div style={{ display: "flex", background: tokens.color.neutralSurfaceSoft, borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {(["A", "B"] as const).map(t => (
          <button key={t} onClick={() => onTabChange(t)} style={{ flex: 1, padding: "6px 0", borderRadius: tokens.radius.sm, border: "none", background: tab === t ? AR.card : "transparent", boxShadow: tab === t ? tokens.shadow.glass : "none", fontSize: 12, fontWeight: 600, color: tab === t ? (t === "A" ? AR.blue : AR.orange) : AR.muteInk, cursor: "pointer", letterSpacing: 0 }}>
            {t === "A" ? `${topA?.title || "貼 A 主群組"}` : `${topB?.title || "貼 B 主群組"}`}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultCardGap }}>
        {(tab === "A" ? evidencesA : evidencesB).map((e, i) => {
          const annotation = e.comment_id ? annotationMap.get(e.comment_id) : undefined;
          const analysisText = annotation?.writerMeaning || null;
          const effectivenessData = annotation
            ? {
                discussionFunction: annotation.discussionFunction,
                relationToCluster: annotation.relationToCluster,
                whyEffective: annotation.whyEffective,
              }
            : null;
          return (
            <DictionaryCard
              key={i}
              rank={i + 1}
              handle={e.author || "anon"}
              quote={e.text || "—"}
              likes={e.like_count ?? null}
              replies={e.reply_count ?? null}
              side={tab}
              marks={annotation?.phraseMarks ?? []}
              analysis={analysisText}
              effectiveness={effectivenessData}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Result: Why It Matters ── */

function ResultWhyCard({ brief }: { brief: CompareBrief | null }) {
  const text = brief?.whyItMatters;
  if (!text) return null;
  const readingStyle = { fontSize: 12, lineHeight: 1.52, letterSpacing: 0, color: AR.softInk, margin: 0, ...WRAP_ANYWHERE };
  return (
    <div style={{ background: AR.card, borderRadius: tokens.radius.card, padding: "16px 17px 15px", boxShadow: tokens.shadow.glass, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: AR.muteInk, letterSpacing: 0, display: "block", marginBottom: 10 }}>為什麼重要</span>
      <div style={{ borderLeft: `2.5px solid ${AR.blue}`, paddingLeft: 12, marginBottom: 12, minWidth: 0 }}>
        <p style={{ fontFamily: tokens.font.sans, fontSize: 16, fontWeight: 600, fontStyle: "italic", lineHeight: 1.5, letterSpacing: 0, color: AR.ink, margin: 0, ...WRAP_ANYWHERE }}>
          {text}
        </p>
      </div>
      {brief?.aReading && brief?.bReading && (
        <div style={{ paddingTop: 10, borderTop: `0.5px solid ${AR.line}`, display: "grid", gap: tokens.spacing.xs }}>
          <p style={readingStyle}><strong>A.</strong> {brief.aReading}</p>
          <p style={readingStyle}><strong>B.</strong> {brief.bReading}</p>
        </div>
      )}
    </div>
  );
}

/* ── Result: Trust Strip + Drawer ── */

function ResultTrustStrip({
  analysisA,
  analysisB,
  capturedA,
  capturedB,
  leftClusterNodes,
  rightClusterNodes,
  defaultOpen = false,
}: {
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedA: number;
  capturedB: number;
  leftClusterNodes: ClusterMapNode[];
  rightClusterNodes: ClusterMapNode[];
  defaultOpen?: boolean;
}) {
  const [drawer, setDrawer] = useState(defaultOpen);
  const mA = analysisMetrics(analysisA);
  const mB = analysisMetrics(analysisB);
  const kA = mA.nClusters ?? (leftClusterNodes.length || 2);
  const kB = mB.nClusters ?? (rightClusterNodes.length || 2);

  const badges = [
    ["◎", `k-means (k=${kA}/${kB})`],
    ["◌", `${capturedA + capturedB} 則留言`],
  ].filter(Boolean) as [string, string][];

  const coverageMetrics = [
    { label: "總留言", value: String(capturedA + capturedB), tint: "neutral" as const },
    { label: "A 貼文", value: String(capturedA), tint: "blue" as const },
    { label: "B 貼文", value: String(capturedB), tint: "orange" as const },
  ];
  const structureMetrics = [
    { label: "A 群組", value: String(leftClusterNodes.length), tint: "blue" as const },
    { label: "B 群組", value: String(rightClusterNodes.length), tint: "orange" as const },
    { label: "A 主導率", value: String(mA.dominance != null ? `${(mA.dominance * 100).toFixed(0)}%` : "—"), tint: "green" as const },
  ];

  const metricCardStyle = (tint: "neutral" | "blue" | "orange" | "green"): React.CSSProperties => {
    if (tint === "blue") {
      return {
        background: tokens.color.accentSoft,
        border: `1px solid ${tokens.color.accentGlow}`,
        boxShadow: `inset 0 2px 0 ${tokens.color.accentGlow}`
      };
    }
    if (tint === "orange") {
      return {
        background: tokens.color.queuedSoft,
        border: `1px solid ${tokens.color.queuedSoft}`,
        boxShadow: `inset 0 2px 0 ${tokens.color.queuedSoft}`
      };
    }
    if (tint === "green") {
      return {
        background: tokens.color.successSoft,
        border: `1px solid ${tokens.color.successSoft}`,
        boxShadow: `inset 0 2px 0 ${tokens.color.successSoft}`
      };
    }
    return {
      background: tokens.color.idleBg,
      border: `1px solid ${tokens.color.idleBorder}`,
      boxShadow: `inset 0 2px 0 ${tokens.color.line}`
    };
  };

  return (
    <div style={{ background: AR.card, borderRadius: 12, overflow: "hidden", boxShadow: COMPARE_CARD_SHADOW }}>
      <div style={{ padding: "11px 15px", display: "flex", alignItems: "center", gap: 7, borderBottom: `0.5px solid ${AR.line}`, flexWrap: "wrap" as const }}>
        {badges.map(([icon, text]) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 4, background: AR.canvas, borderRadius: 6, padding: "4px 9px" }}>
            <span style={{ fontSize: 9.5, color: AR.muteInk }}>{icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: AR.softInk }}>{text}</span>
          </div>
        ))}
      </div>
      <button onClick={() => setDrawer(d => !d)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "11px 15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="0.5" y="0.5" width="5" height="5" rx="1.2" fill={AR.dimInk}/><rect x="7.5" y="0.5" width="5" height="5" rx="1.2" fill={AR.dimInk}/><rect x="0.5" y="7.5" width="5" height="5" rx="1.2" fill={AR.dimInk}/><rect x="7.5" y="7.5" width="5" height="5" rx="1.2" fill={AR.dimInk}/></svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: AR.softInk }}>驗證數據</span>
          <span style={{ fontSize: 10, color: AR.dimInk, background: AR.canvas, borderRadius: 6, padding: "1px 6px" }}>叢集圖・方法論</span>
        </div>
        <ARChevron open={drawer} />
      </button>
      {drawer && (
        <div style={{ borderTop: `0.5px solid ${AR.line}`, padding: "13px 15px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0.3, marginBottom: 8 }}>叢集分佈圖</div>
          <FlowingClusterViz />
          <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>資料覆蓋</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {coverageMetrics.map((metric) => (
                  <div key={metric.label} style={{ ...metricCardStyle(metric.tint), borderRadius: 9, padding: "7px 9px 8px" }}>
                    <div style={{ fontSize: 9, color: AR.muteInk, marginBottom: 4 }}>{metric.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: AR.muteInk, letterSpacing: 0 }}>結構特徵</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {structureMetrics.map((metric) => (
                  <div key={metric.label} style={{ ...metricCardStyle(metric.tint), borderRadius: 9, padding: "7px 9px 8px" }}>
                    <div style={{ fontSize: 9, color: AR.muteInk, marginBottom: 4 }}>{metric.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: AR.softInk, lineHeight: 1.52, background: AR.canvas, borderRadius: 8, padding: "9px 12px", ...WRAP_ANYWHERE }}>
            <span style={{ fontWeight: 700 }}>方法論：</span>k-means 叢集分析（k={kA}/{kB}），基於留言情緒向量、用詞模式、互動行為分組。
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Result Reading Body (replaces CompareJudgmentSheet) ── */

function ResultParallelColumn({
  side,
  post,
  captured,
  surface,
  summary,
  reading,
  annotationMap
}: {
  side: "A" | "B";
  post: PostData | null;
  captured: number;
  surface: ClusterSurface | null;
  summary: ClusterSummaryCard | null;
  reading: string | null;
  annotationMap: Map<string, EvidenceAnnotation>;
}) {
  const isA = side === "A";
  const accent = isA ? AR.blue : AR.orange;
  const softBg = isA ? tokens.color.accentSoft : tokens.color.queuedSoft;
  const border = isA ? tokens.color.accentGlow : tokens.color.queuedSoft;
  const evidences = surface?.audienceEvidence.slice(0, 2) ?? [];
  const clusterPct = summary ? Math.round(summary.cluster.size_share * 100) : null;

  return (
    <section
      data-parallel-column={side}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacing.resultCardGap,
        minWidth: 0
      }}
    >
      {post ? (
        <PostHeader
          post={post}
          label={`Post ${side}`}
          color={softBg}
          borderColor={border}
          commentCount={captured}
        />
      ) : null}

      <div
        style={{
          background: AR.card,
          borderRadius: tokens.radius.card,
          border: `1px solid ${AR.line}`,
          boxShadow: tokens.shadow.glass,
          padding: "13px 14px",
          display: "grid",
          gap: 10,
          minWidth: 0
        }}
      >
        <SectionLabel color={accent}>留言區聲量結構</SectionLabel>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: AR.ink, lineHeight: 1.35, ...WRAP_ANYWHERE }}>
              {surface?.title || "主群組未定"}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: AR.muteInk, ...WRAP_ANYWHERE }}>
              {summary ? clusterSupportLabel(summary) : "No cluster summary"}
            </div>
            {surface ? (
              <div
                data-cluster-provenance={surface.provenance}
                title={surface.provenanceDetail}
                style={{ marginTop: 4, fontSize: 10.5, color: AR.muteInk, fontWeight: 700, ...WRAP_ANYWHERE }}
              >
                {surface.provenanceLabel}
              </div>
            ) : null}
          </div>
          {clusterPct != null ? (
            <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>
              {clusterPct}<span style={{ fontSize: 13, fontWeight: 500 }}>%</span>
            </div>
          ) : null}
        </div>
      </div>

      {reading ? (
        <div
          style={{
            background: AR.card,
            borderRadius: tokens.radius.card,
            borderLeft: `3px solid ${accent}`,
            boxShadow: tokens.shadow.glass,
            padding: "12px 14px",
            minWidth: 0
          }}
        >
          <SectionLabel color={accent}>{`Post ${side} reading`}</SectionLabel>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.58, color: AR.softInk, ...WRAP_ANYWHERE }}>
            {reading}
          </p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
        <SectionLabel color={accent}>代表性原文</SectionLabel>
        {evidences.length ? evidences.map((e, index) => {
          const annotation = e.comment_id ? annotationMap.get(e.comment_id) : undefined;
          const effectivenessData = annotation
            ? {
                discussionFunction: annotation.discussionFunction,
                relationToCluster: annotation.relationToCluster,
                whyEffective: annotation.whyEffective,
              }
            : null;
          return (
            <DictionaryCard
              key={e.comment_id || index}
              rank={index + 1}
              handle={e.author || "anon"}
              quote={e.text || "—"}
              likes={e.like_count ?? null}
              replies={e.reply_count ?? null}
              side={side}
              marks={annotation?.phraseMarks ?? []}
              analysis={annotation?.writerMeaning || null}
              effectiveness={effectivenessData}
            />
          );
        }) : (
          <div style={{ fontSize: 12, color: AR.muteInk, background: AR.card, borderRadius: tokens.radius.card, border: `1px solid ${AR.line}`, padding: "12px 14px" }}>
            No audience evidence captured yet.
          </div>
        )}
      </div>
    </section>
  );
}

function ResultChapterFrame({
  chapter,
  title,
  accent = AR.ink,
  children
}: {
  chapter: "I" | "II" | "III" | "IV" | "V";
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-chapter={chapter}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacing.resultCardGap,
        paddingTop: chapter === "I" ? 0 : 4,
        minWidth: 0
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
        <span style={{ fontFamily: tokens.font.mono, fontSize: 11, fontWeight: 800, color: accent, whiteSpace: "nowrap" }}>
          § {chapter}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: AR.muteInk, letterSpacing: "0.02em" }}>
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

function ResultChapterPostSection({
  side,
  post,
  captured,
  surface,
  summary,
  reading
}: {
  side: "A" | "B";
  post: PostData | null;
  captured: number;
  surface: ClusterSurface | null;
  summary: ClusterSummaryCard | null;
  reading: string | null;
}) {
  const isA = side === "A";
  const accent = isA ? AR.blue : AR.orange;
  const softBg = isA ? tokens.color.accentSoft : tokens.color.queuedSoft;
  const border = isA ? tokens.color.accentGlow : tokens.color.queuedSoft;
  const clusterPct = summary ? Math.round(summary.cluster.size_share * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultCardGap, minWidth: 0 }}>
      {post ? (
        <PostHeader
          post={post}
          label={`Post ${side}`}
          color={softBg}
          borderColor={border}
          commentCount={captured}
        />
      ) : null}

      {reading ? (
        <div
          style={{
            background: AR.card,
            borderRadius: tokens.radius.card,
            borderLeft: `3px solid ${accent}`,
            boxShadow: tokens.shadow.glass,
            padding: "12px 14px",
            minWidth: 0
          }}
        >
          <SectionLabel color={accent}>{`${side} reading`}</SectionLabel>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.58, color: AR.softInk, ...WRAP_ANYWHERE }}>
            {reading}
          </p>
        </div>
      ) : null}

      <div
        style={{
          background: AR.card,
          borderRadius: tokens.radius.card,
          border: `1px solid ${AR.line}`,
          boxShadow: tokens.shadow.glass,
          padding: "13px 14px",
          display: "grid",
          gap: 10,
          minWidth: 0
        }}
      >
        <SectionLabel color={accent}>Top cluster</SectionLabel>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: AR.ink, lineHeight: 1.35, ...WRAP_ANYWHERE }}>
              {surface?.title || "主群組未定"}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: AR.muteInk, ...WRAP_ANYWHERE }}>
              {surface?.thesis || (summary ? clusterSupportLabel(summary) : "No cluster summary")}
            </div>
            {surface ? (
              <div
                data-cluster-provenance={surface.provenance}
                title={surface.provenanceDetail}
                style={{ marginTop: 4, fontSize: 10.5, color: AR.muteInk, fontWeight: 700, ...WRAP_ANYWHERE }}
              >
                {surface.provenanceLabel}
              </div>
            ) : null}
          </div>
          {clusterPct != null ? (
            <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1 }}>
              {clusterPct}<span style={{ fontSize: 13, fontWeight: 500 }}>%</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultChaptersBody({
  heroSummary,
  brief,
  postA,
  postB,
  leftSummaries,
  rightSummaries,
  leftSurfaces,
  rightSurfaces,
  analysisA,
  analysisB,
  capturedA,
  capturedB,
  leftClusterNodes,
  rightClusterNodes,
  annotationMap,
}: {
  heroSummary: CompareHeroSummary | null;
  brief: CompareBrief | null;
  postA: PostData | null;
  postB: PostData | null;
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedA: number;
  capturedB: number;
  leftClusterNodes: ClusterMapNode[];
  rightClusterNodes: ClusterMapNode[];
  annotationMap: Map<string, EvidenceAnnotation>;
}) {
  const relation = heroSummary?.relation || brief?.relation || heroSummary?.headline || "A/B relation pending.";
  const initial = relation.trim().slice(0, 1);
  const rest = relation.trim().slice(1);
  const evidenceItems = [
    ...(leftSurfaces[0]?.audienceEvidence.slice(0, 2).map((evidence) => ({ evidence, side: "A" as const })) ?? []),
    ...(rightSurfaces[0]?.audienceEvidence.slice(0, 2).map((evidence) => ({ evidence, side: "B" as const })) ?? [])
  ];

  return (
    <div data-compare-layout="chapters" style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultSectionGap, minWidth: 0 }}>
      <ResultChapterFrame chapter="I" title="Relation" accent={AR.green}>
        <div
          style={{
            background: AR.card,
            borderRadius: 14,
            border: `1px solid ${AR.line}`,
            boxShadow: tokens.shadow.glass,
            padding: "22px 18px",
            textAlign: "center",
            minWidth: 0
          }}
        >
          <div style={{ fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`, fontSize: 27, lineHeight: 1.25, color: AR.ink, ...WRAP_ANYWHERE }}>
            <span style={{ fontSize: 56, lineHeight: 0.9, color: AR.green, verticalAlign: "baseline" }}>{initial}</span>{rest}
          </div>
          {heroSummary?.headline ? (
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: AR.muteInk, ...WRAP_ANYWHERE }}>
              {heroSummary.headline}
            </div>
          ) : null}
        </div>
      </ResultChapterFrame>

      <ResultChapterFrame chapter="II" title="Post A context, reading, top cluster" accent={AR.blue}>
        <ResultChapterPostSection
          side="A"
          post={postA}
          captured={capturedA}
          surface={leftSurfaces[0] || null}
          summary={leftSummaries[0] || null}
          reading={brief?.aReading || null}
        />
      </ResultChapterFrame>

      <ResultChapterFrame chapter="III" title="Post B context, reading, top cluster" accent={AR.orange}>
        <ResultChapterPostSection
          side="B"
          post={postB}
          captured={capturedB}
          surface={rightSurfaces[0] || null}
          summary={rightSummaries[0] || null}
          reading={brief?.bReading || null}
        />
      </ResultChapterFrame>

      <ResultChapterFrame chapter="IV" title="原文證據" accent={AR.ink}>
        <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultCardGap, minWidth: 0 }}>
          {evidenceItems.length ? evidenceItems.map(({ evidence, side }, index) => {
            const annotation = evidence.comment_id ? annotationMap.get(evidence.comment_id) : undefined;
            const effectivenessData = annotation
              ? {
                  discussionFunction: annotation.discussionFunction,
                  relationToCluster: annotation.relationToCluster,
                  whyEffective: annotation.whyEffective,
                }
              : null;
            return (
              <DictionaryCard
                key={`${side}-${evidence.comment_id || index}`}
                rank={index + 1}
                handle={evidence.author || "anon"}
                quote={evidence.text || "—"}
                likes={evidence.like_count ?? null}
                replies={evidence.reply_count ?? null}
                side={side}
                marks={annotation?.phraseMarks ?? []}
                analysis={annotation?.writerMeaning || null}
                effectiveness={effectivenessData}
              />
            );
          }) : (
            <div style={{ fontSize: 12, color: AR.muteInk, background: AR.card, borderRadius: tokens.radius.card, border: `1px solid ${AR.line}`, padding: "12px 14px" }}>
              No audience evidence captured yet.
            </div>
          )}
        </div>
      </ResultChapterFrame>

      <ResultChapterFrame chapter="V" title="Why it matters + trust" accent={AR.green}>
        <ResultWhyCard brief={brief} />
        <ResultTrustStrip
          analysisA={analysisA}
          analysisB={analysisB}
          capturedA={capturedA}
          capturedB={capturedB}
          leftClusterNodes={leftClusterNodes}
          rightClusterNodes={rightClusterNodes}
        />
      </ResultChapterFrame>
    </div>
  );
}

function ResultParallelBody({
  heroSummary,
  brief,
  briefProvenanceLabel,
  postA,
  postB,
  leftSummaries,
  rightSummaries,
  leftSurfaces,
  rightSurfaces,
  analysisA,
  analysisB,
  capturedA,
  capturedB,
  leftClusterNodes,
  rightClusterNodes,
  compareBriefState,
  annotationMap,
}: {
  heroSummary: CompareHeroSummary | null;
  brief: CompareBrief | null;
  briefProvenanceLabel: string;
  postA: PostData | null;
  postB: PostData | null;
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedA: number;
  capturedB: number;
  leftClusterNodes: ClusterMapNode[];
  rightClusterNodes: ClusterMapNode[];
  compareBriefState: "idle" | "loading" | "ready" | "fallback";
  annotationMap: Map<string, EvidenceAnnotation>;
}) {
  return (
    <div data-compare-layout="parallel" style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultSectionGap, minWidth: 0 }}>
      <ResultHeroCard
        heroSummary={heroSummary}
        brief={brief}
        postA={postA}
        postB={postB}
        compareBriefState={compareBriefState}
        briefProvenanceLabel={briefProvenanceLabel}
      />
      <div
        data-parallel-header="sticky"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 8,
          padding: "8px",
          borderRadius: 12,
          border: `1px solid ${AR.line}`,
          background: tokens.color.shellSurface,
          boxShadow: tokens.shadow.glass,
          backdropFilter: "blur(8px)",
          minWidth: 0
        }}
      >
        {([
          { label: "Post A", post: postA, color: AR.blue },
          { label: "Post B", post: postB, color: AR.orange }
        ] as const).map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: item.color, whiteSpace: "nowrap" }}>{item.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: AR.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              @{item.post?.author || "unknown"}
            </span>
          </div>
        ))}
      </div>
      <div
        data-parallel-grid="ab"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: tokens.spacing.resultCardGap,
          minWidth: 0
        }}
      >
        <ResultParallelColumn
          side="A"
          post={postA}
          captured={capturedA}
          surface={leftSurfaces[0] || null}
          summary={leftSummaries[0] || null}
          reading={brief?.aReading || null}
          annotationMap={annotationMap}
        />
        <ResultParallelColumn
          side="B"
          post={postB}
          captured={capturedB}
          surface={rightSurfaces[0] || null}
          summary={rightSummaries[0] || null}
          reading={brief?.bReading || null}
          annotationMap={annotationMap}
        />
      </div>
      <ResultWhyCard
        brief={brief}
      />
      <ResultTrustStrip
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedA}
        capturedB={capturedB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
      />
    </div>
  );
}

function ResultReadingBody({
  heroSummary,
  brief,
  briefProvenanceLabel,
  postA,
  postB,
  leftSummaries,
  rightSummaries,
  leftSurfaces,
  rightSurfaces,
  analysisA,
  analysisB,
  capturedA,
  capturedB,
  leftClusterNodes,
  rightClusterNodes,
  compareBriefState,
  onOpenTechnique,
  annotationMap,
  layout,
}: {
  heroSummary: CompareHeroSummary | null;
  brief: CompareBrief | null;
  briefProvenanceLabel: string;
  postA: PostData | null;
  postB: PostData | null;
  leftSummaries: ClusterSummaryCard[];
  rightSummaries: ClusterSummaryCard[];
  leftSurfaces: ClusterSurface[];
  rightSurfaces: ClusterSurface[];
  analysisA: AnalysisSnapshot | null;
  analysisB: AnalysisSnapshot | null;
  capturedA: number;
  capturedB: number;
  leftClusterNodes: ClusterMapNode[];
  rightClusterNodes: ClusterMapNode[];
  compareBriefState: "idle" | "loading" | "ready" | "fallback";
  onOpenTechnique: (side: "A" | "B") => void;
  annotationMap: Map<string, EvidenceAnnotation>;
  layout: CompareResultLayout;
}) {
  void onOpenTechnique; // available for future technique entry point
  const [activeResultTab, setActiveResultTab] = useState<"A" | "B">("A");
  if (layout === "parallel") {
    return (
      <ResultParallelBody
        heroSummary={heroSummary}
        brief={brief}
        postA={postA}
        postB={postB}
        leftSummaries={leftSummaries}
        rightSummaries={rightSummaries}
        leftSurfaces={leftSurfaces}
        rightSurfaces={rightSurfaces}
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedA}
        capturedB={capturedB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
        compareBriefState={compareBriefState}
        briefProvenanceLabel={briefProvenanceLabel}
        annotationMap={annotationMap}
      />
    );
  }

  if (layout === "chapters") {
    return (
      <ResultChaptersBody
        heroSummary={heroSummary}
        brief={brief}
        postA={postA}
        postB={postB}
        leftSummaries={leftSummaries}
        rightSummaries={rightSummaries}
        leftSurfaces={leftSurfaces}
        rightSurfaces={rightSurfaces}
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedA}
        capturedB={capturedB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
        annotationMap={annotationMap}
      />
    );
  }

  return (
    <div data-compare-layout="reading" style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.resultSectionGap }}>
      <ResultHeroCard
        heroSummary={heroSummary}
        brief={brief}
        postA={postA}
        postB={postB}
        compareBriefState={compareBriefState}
        briefProvenanceLabel={briefProvenanceLabel}
      />
      <ResultBalanceCard
        leftSummaries={leftSummaries}
        rightSummaries={rightSummaries}
        leftSurfaces={leftSurfaces}
        rightSurfaces={rightSurfaces}
        capturedA={capturedA}
        capturedB={capturedB}
        activeTab={activeResultTab}
        onTabChange={setActiveResultTab}
      />
      <ResultEvidenceSection
        leftSurfaces={leftSurfaces}
        rightSurfaces={rightSurfaces}
        annotationMap={annotationMap}
        tab={activeResultTab}
        onTabChange={setActiveResultTab}
      />
      <ResultWhyCard
        brief={brief}
      />
      <ResultTrustStrip
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedA}
        capturedB={capturedB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
      />
    </div>
  );
}

function resolveAnnotationRequestKey(
  lastRequestKey: string | null,
  request: EvidenceAnnotationRequest | null
): { requestKey: string | null; shouldRequest: boolean } {
  if (!request) {
    return { requestKey: null, shouldRequest: false };
  }
  const requestKey = request.quotes.map((q) => q.commentId).sort().join("|");
  return {
    requestKey,
    shouldRequest: lastRequestKey !== requestKey
  };
}

/* ── Main CompareView ── */

export const compareViewTestables = {
  getPost,
  buildClusterSummaries,
  layoutClusterMapNodes,
  analysisMetrics,
  visibleClusterCountLabel,
  hiddenClusterCountLabel,
  resolveClusterSurface,
  selectedClusterDetailFromSurface,
  resolveEvidenceKeywordFilter,
  ResultTrustStrip,
  SectionLabel,
  PostHeader,
  ClusterBubbleMap,
  DictionaryCard,
  ResultWhyCard,
  resolveAnnotationRequestKey,
  hasConfiguredProviderKey
};

export function CompareView({
  viewModel,
  onCommand
}: CompareViewProps) {
  const {
    readyItemOptions,
    selection,
    postA,
    postB,
    commentsA,
    commentsB,
    analysisA,
    analysisB,
    capturedCommentCountA,
    capturedCommentCountB,
    ageA,
    ageB,
    brief,
    clusters,
    annotationByCommentId,
    attachment,
    compareLayout,
    hideSelector,
    aiProviderConfigured
  } = viewModel;
  const { selectedA, selectedB, itemA, itemB } = selection;
  const [selectedClusterA, setSelectedClusterA] = useState<ClusterSelectionRef | null>(null);
  const [selectedClusterB, setSelectedClusterB] = useState<ClusterSelectionRef | null>(null);
  const [hoveredClusterKey, setHoveredClusterKey] = useState<string | null>(null);
  const [expandedEvidenceKeys, setExpandedEvidenceKeys] = useState<Set<string>>(new Set());
  const [highlightedClusterPanel, setHighlightedClusterPanel] = useState<"A" | "B" | null>(null);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [engagementExpanded, setEngagementExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [comparePage, setComparePage] = useState<"compare" | "technique">("compare");
  const [techniqueSide, setTechniqueSide] = useState<"A" | "B">("A");
  const [selectedDetailSide, setSelectedDetailSide] = useState<"A" | "B">("A");
  const [techniqueSaveState, setTechniqueSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [attachTopicId, setAttachTopicId] = useState(attachment.topics[0]?.id || "");
  const clustersSectionRef = useRef<HTMLDivElement | null>(null);
  const engagementSectionRef = useRef<HTMLDivElement | null>(null);
  const commentsSectionRef = useRef<HTMLDivElement | null>(null);
  const detailRefA = useRef<HTMLDivElement | null>(null);
  const detailRefB = useRef<HTMLDivElement | null>(null);
  const detailPageRefA = useRef<HTMLDivElement | null>(null);
  const detailPageRefB = useRef<HTMLDivElement | null>(null);
  const clusterMapRefA = useRef<HTMLDivElement | null>(null);
  const clusterMapRefB = useRef<HTMLDivElement | null>(null);

  const annotationMap = useMemo(
    () => new Map<string, EvidenceAnnotation>(
      Object.values(annotationByCommentId).map((annotation) => [annotation.commentId, annotation])
    ),
    [annotationByCommentId]
  );

  useEffect(() => {
    if (!attachment.topics.length) {
      if (attachTopicId) {
        setAttachTopicId("");
      }
      return;
    }
    if (!attachTopicId || !attachment.topics.some((topic) => topic.id === attachTopicId)) {
      setAttachTopicId(attachment.topics[0]!.id);
    }
  }, [attachTopicId, attachment.topics]);

  const leftClusterSummaries = clusters.leftSummaries;
  const rightClusterSummaries = clusters.rightSummaries;
  const leftClusterSurfaces = clusters.leftSurfaces;
  const rightClusterSurfaces = clusters.rightSurfaces;
  const leftClusterNodes = clusters.leftNodes;
  const rightClusterNodes = clusters.rightNodes;
  const firstLeftCluster = leftClusterSurfaces[0] || null;
  const firstRightCluster = rightClusterSurfaces[0] || null;
  const selectedClusterKeyA = selectedClusterA?.key ?? firstLeftCluster?.key ?? null;
  const selectedClusterKeyB = selectedClusterB?.key ?? firstRightCluster?.key ?? null;
  const selectedClusterSurfaceA = leftClusterSurfaces.find((surface) => surface.key === selectedClusterKeyA) || null;
  const selectedClusterSurfaceB = rightClusterSurfaces.find((surface) => surface.key === selectedClusterKeyB) || null;
  const relatedClusterA = selectedClusterSurfaceA ? findRelatedCluster(selectedClusterSurfaceA, rightClusterSurfaces) : null;
  const relatedClusterB = selectedClusterSurfaceB ? findRelatedCluster(selectedClusterSurfaceB, leftClusterSurfaces) : null;
  const selectedClusterDetailA = selectedClusterDetailFromSurface(
    selectedClusterSurfaceA,
    relatedClusterA,
    authorStanceSummary(postA, selectedClusterSurfaceA?.title || "主題未定", "A")
  );
  const selectedClusterDetailB = selectedClusterDetailFromSurface(
    selectedClusterSurfaceB,
    relatedClusterB,
    authorStanceSummary(postB, selectedClusterSurfaceB?.title || "主題未定", "B")
  );

  useEffect(() => {
    if (!leftClusterSurfaces.length) {
      if (selectedClusterA !== null) setSelectedClusterA(null);
      return;
    }
    if (selectedClusterA && leftClusterSurfaces.some((surface) => surface.key === selectedClusterA.key)) return;
    setSelectedClusterA({ key: leftClusterSurfaces[0]!.key });
  }, [selectedClusterA, leftClusterSurfaces]);

  useEffect(() => {
    if (!rightClusterSurfaces.length) {
      if (selectedClusterB !== null) setSelectedClusterB(null);
      return;
    }
    if (selectedClusterB && rightClusterSurfaces.some((surface) => surface.key === selectedClusterB.key)) return;
    setSelectedClusterB({ key: rightClusterSurfaces[0]!.key });
  }, [selectedClusterB, rightClusterSurfaces]);

  const toggleEvidence = (key: string) => {
    setExpandedEvidenceKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!highlightedClusterPanel) return;
    const timeout = window.setTimeout(() => setHighlightedClusterPanel(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [highlightedClusterPanel]);

  useEffect(() => {
    if (selectedDetailSide === "A") {
      detailPageRefA.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      return;
    }
    detailPageRefB.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }, [selectedDetailSide]);

  const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const selectClusterAndFocus = (side: "A" | "B", key: string) => {
    if (side === "A") {
      setSelectedClusterA({ key });
      setSelectedDetailSide("A");
      setComparePage("compare");
      setTechniqueSide("A");
      setTechniqueSaveState("idle");
      setHighlightedClusterPanel("A");
      window.requestAnimationFrame(() => {
        detailPageRefA.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        detailRefA.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    setComparePage("compare");
    setTechniqueSide("B");
    setTechniqueSaveState("idle");
    setSelectedDetailSide("B");
    setSelectedClusterB({ key });
    setHighlightedClusterPanel("B");
    window.requestAnimationFrame(() => {
      detailPageRefB.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      detailRefB.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openTechniqueView = (side: "A" | "B") => {
    setTechniqueSide(side);
    setTechniqueSaveState("idle");
    setComparePage("technique");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const jumpBackToCluster = () => {
    const side = techniqueSide;
    setComparePage("compare");
    setTechniqueSaveState("idle");
    setSupportExpanded(true);
    if (side === "A") {
      setHighlightedClusterPanel("A");
      scrollToRef(clusterMapRefA);
      return;
    }
    setHighlightedClusterPanel("B");
    scrollToRef(clusterMapRefB);
  };

  const currentTechniqueItem = techniqueSide === "A" ? itemA : itemB;
  const currentTechniqueDetail = techniqueSide === "A" ? selectedClusterDetailA : selectedClusterDetailB;

  const saveTechniqueReading = async () => {
    if (!currentTechniqueItem || !currentTechniqueDetail) {
      return;
    }
    setTechniqueSaveState("saving");
    try {
      await onCommand({
        kind: "saveTechniqueReading",
        target: {
          sessionId: viewModel.sessionId,
          itemId: currentTechniqueItem.id,
          side: techniqueSide,
          clusterKey: compareSelectionKey(currentTechniqueDetail.captureId, currentTechniqueDetail.clusterKey)
        },
        detail: currentTechniqueDetail
      });
      setTechniqueSaveState("saved");
    } catch {
      setTechniqueSaveState("error");
    }
  };

  const selectPair = (nextA: string, nextB: string) => {
    void onCommand({
      kind: "selectPair",
      target: { sessionId: viewModel.sessionId, itemAId: nextA, itemBId: nextB }
    });
  };

  if (!viewModel.availability.ready) {
    return (
      <CompareUnavailableBridge
        readiness={viewModel.readiness}
        onGoToLibrary={() => void onCommand({ kind: "goToLibrary", target: { sessionId: viewModel.sessionId } })}
      />
    );
  }

  if (comparePage === "technique") {
    return (
      <TechniqueView
        sideLabel={techniqueSide}
        detail={currentTechniqueDetail}
        onBack={() => setComparePage("compare")}
        onSave={() => void saveTechniqueReading()}
        onJumpToCluster={jumpBackToCluster}
        saveState={techniqueSaveState}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0, overflowX: "hidden" }}>
      {attachment.fromTopicId && attachment.fromTopicName ? (
        <button
          type="button"
          onClick={() => void onCommand({ kind: "returnToTopic", target: { sessionId: viewModel.sessionId, topicId: attachment.fromTopicId! } })}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: T.sub,
            fontSize: 11,
            fontWeight: 700
          }}
        >
          <span>案例本</span>
          <span style={{ color: T.soft }}>›</span>
          <span>{attachment.fromTopicName}</span>
          <span style={{ color: T.soft }}>›</span>
          <span>成對檢視</span>
        </button>
      ) : null}

      {!hideSelector ? (
        <CompareSelectorStrip
          options={readyItemOptions}
          selectedA={selectedA}
          selectedB={selectedB}
          onChangeA={(value) => selectPair(value, selectedB)}
          onChangeB={(value) => selectPair(selectedA, value)}
        />
      ) : null}

      {!aiProviderConfigured && brief.request ? (
        <div style={{ fontSize: 11, color: T.sub, background: tokens.color.neutralSurfaceSoft, border: `1px solid ${T.line}`, borderRadius: TOKENS.pillRadius, padding: "8px 10px" }}>
          AI summaries are off. Add a Google, OpenAI, or Claude key in Settings to enable them.
        </div>
      ) : null}

      <ResultReadingBody
        heroSummary={brief.heroSummary}
        brief={brief.visibleBrief}
        briefProvenanceLabel={brief.provenanceLabel}
        postA={postA}
        postB={postB}
        leftSummaries={leftClusterSummaries}
        rightSummaries={rightClusterSummaries}
        leftSurfaces={leftClusterSurfaces}
        rightSurfaces={rightClusterSurfaces}
        analysisA={analysisA}
        analysisB={analysisB}
        capturedA={capturedCommentCountA}
        capturedB={capturedCommentCountB}
        leftClusterNodes={leftClusterNodes}
        rightClusterNodes={rightClusterNodes}
        compareBriefState={brief.state}
        onOpenTechnique={openTechniqueView}
        annotationMap={annotationMap}
        layout={compareLayout}
      />

      {attachment.activeResultId && attachment.topics.length ? (
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: "12px 14px",
            borderRadius: tokens.radius.card,
            border: `1px solid ${T.line}`,
            background: tokens.color.surface
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>附加至案例</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={attachTopicId}
              onChange={(event) => setAttachTopicId(event.target.value)}
              style={{
                minWidth: 160,
                borderRadius: 10,
                border: `1px solid ${T.line}`,
                padding: "8px 10px",
                background: tokens.color.elevated,
                color: T.ink
              }}
            >
              {attachment.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
            <PrimaryButton
              onClick={() => attachTopicId && attachment.activeResultId && void onCommand({
                kind: "attachToTopic",
                target: { sessionId: viewModel.sessionId, resultId: attachment.activeResultId, topicId: attachTopicId }
              })}
              disabled={!attachTopicId || attachment.attachedTopicIds.includes(attachTopicId)}
            >
              {attachTopicId && attachment.attachedTopicIds.includes(attachTopicId) ? "已附加" : "附加至案例"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
