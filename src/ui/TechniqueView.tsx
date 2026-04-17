import { useState } from "react";
import type { SelectedClusterDetail } from "../analysis/types.ts";
import { buildClusterSpecificTechniqueNotes, rankTechniqueNotesForDisplay } from "../compare/technique-reading.ts";
import { EvidenceMetricRow } from "./components.tsx";
import { TOKENS, tokens } from "./tokens";

const T = {
  ink: TOKENS.ink,
  sub: TOKENS.subInk,
  soft: TOKENS.softInk,
  line: TOKENS.line,
  accent: TOKENS.accent,
  accentSoft: TOKENS.accentSoft,
  warn: TOKENS.queued,
  warnSoft: TOKENS.queuedSoft,
  success: TOKENS.success,
  successSoft: TOKENS.successSoft,
  fail: TOKENS.failed,
  failSoft: TOKENS.failedSoft,
  techniqueRose: tokens.color.techniqueRose,
  techniqueAmber: tokens.color.techniqueAmber,
  techniqueTeal: tokens.color.techniqueTeal,
  techniqueBlue: tokens.color.techniqueBlue,
  techniqueViolet: tokens.color.techniqueViolet
} as const;

const WRAP_ANYWHERE = {
  minWidth: 0,
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const
};

interface TechniqueViewProps {
  sideLabel: "A" | "B";
  detail: SelectedClusterDetail | null;
  onBack: () => void;
  onSave: () => void;
  onJumpToCluster: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
}

function evidencePreview(text: string | undefined): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "No audience evidence text captured.";
  return value;
}

const TECHNIQUE_ACCENTS = [
  T.techniqueRose,
  T.techniqueAmber,
  T.techniqueTeal,
  T.techniqueBlue,
  T.techniqueViolet
] as const;

function buildClusterMatterNote(detail: SelectedClusterDetail): string {
  const evidenceCount = detail.audienceEvidence.length;
  return `${detail.supportLabel} support this reading. ${evidenceCount > 0 ? "The evidence here is strong enough to explain why this audience cluster matters." : "This cluster still needs stronger evidence before it becomes a reliable read."}`;
}

function buildClusterDifferenceNote(sideLabel: "A" | "B", detail: SelectedClusterDetail): string {
  if (detail.relatedCluster) {
    return `Post ${sideLabel} keeps this cluster tied to "${detail.clusterTitle}", while Post ${detail.relatedCluster.side === "left" ? "A" : "B"} is closer to "${detail.relatedCluster.title}".`;
  }

  switch (detail.alignment) {
    case "Align":
      return `Post ${sideLabel} stays close to the author stance here, so the difference is more about emphasis than outright conflict.`;
    case "Oppose":
      return `Post ${sideLabel} turns this cluster into a rebuttal surface, so the audience is pushing away from the author stance rather than reinforcing it.`;
    default:
      return `Post ${sideLabel} keeps this cluster in an unstable middle state, mixing support and resistance instead of settling into one clear direction.`;
  }
}

export function TechniqueView({
  sideLabel,
  detail,
  onBack,
  onSave,
  onJumpToCluster,
  saveState
}: TechniqueViewProps) {
  if (!detail) {
    return (
      <div
        data-technique-view="missing-detail"
        style={{ display: "grid", gap: 18 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              borderRadius: tokens.radius.pill,
              border: `1px solid ${T.line}`,
              background: tokens.color.neutralSurfaceSoft,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 700,
              color: T.sub,
              cursor: "pointer"
            }}
          >
            ← Back to Compare
          </button>
          <span style={{ fontSize: 10, fontWeight: 700, color: sideLabel === "A" ? T.accent : T.warn, letterSpacing: "0.03em" }}>
            {`Post ${sideLabel} · Deeper reading`}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gap: 8,
            padding: "18px 16px",
            borderRadius: tokens.radius.lg,
            border: `1px solid ${T.line}`,
            background: tokens.color.contentSurface
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>Deeper reading is unavailable right now.</div>
          <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6 }}>
            The selected cluster context is missing, so this page would otherwise render blank. Go back to Compare and re-open the cluster.
          </div>
        </div>
      </div>
    );
  }

  const techniqueNotes = rankTechniqueNotesForDisplay(buildClusterSpecificTechniqueNotes(detail));
  const visibleTechniqueNotes = techniqueNotes.filter((note) => (note.triggerStrength ?? 0) >= 2).slice(0, 2);
  const notesToRender = visibleTechniqueNotes.length ? visibleTechniqueNotes : techniqueNotes.slice(0, 1);
  const [activeTechniqueKey, setActiveTechniqueKey] = useState<string | null>(notesToRender[0]?.key ?? null);
  const leadEvidence = detail.audienceEvidence.slice(0, 2);

  return (
    <div data-technique-view="visible" data-technique-surface="reading-strip" style={{ display: "grid", gap: 28 }}>

      {/* Nav row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            borderRadius: tokens.radius.pill,
            border: `1px solid ${T.line}`,
            background: tokens.color.neutralSurfaceSoft,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            color: T.sub,
            cursor: "pointer"
          }}
        >
          ← Back to Compare
        </button>
        <span style={{ fontSize: 10, fontWeight: 700, color: sideLabel === "A" ? T.accent : T.warn, letterSpacing: "0.03em" }}>
          {`Post ${sideLabel} · Deeper reading`}
        </span>
      </div>

      {/* Cluster context */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div data-technique-context="cluster-note" style={{ display: "grid", gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.soft, letterSpacing: "0.03em" }}>Technique / Evidence</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, lineHeight: 1.2, ...WRAP_ANYWHERE }}>{detail.clusterTitle}</div>
          <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.75, ...WRAP_ANYWHERE }}>{detail.thesis}</div>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 5, paddingLeft: 14, borderLeft: `3px solid ${T.accentSoft}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>Why this cluster matters</div>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.7, ...WRAP_ANYWHERE }}>{buildClusterMatterNote(detail)}</div>
            </div>
            <div style={{ display: "grid", gap: 5, paddingLeft: 14, borderLeft: `3px solid ${T.warnSoft}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>{`How Post ${sideLabel} differs`}</div>
              <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.7, ...WRAP_ANYWHERE }}>{buildClusterDifferenceNote(sideLabel, detail)}</div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === "saving"}
          style={{
            borderRadius: tokens.radius.pill,
            border: `1px solid ${saveState === "saved" ? T.success : saveState === "error" ? T.fail : T.line}`,
            background: saveState === "saved" ? T.successSoft : saveState === "error" ? T.failSoft : tokens.color.neutralSurfaceSoft,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 700,
            color: saveState === "saved" ? T.success : saveState === "error" ? T.fail : T.sub,
            cursor: saveState === "saving" ? "wait" : "pointer",
            opacity: saveState === "saving" ? 0.7 : 1,
            flexShrink: 0
          }}
        >
          {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Retry save" : "Save to library"}
        </button>
      </div>

      {/* Evidence */}
      <div data-technique-evidence="case-note" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.soft, letterSpacing: "0.03em" }}>Evidence</div>
          <button
            type="button"
            onClick={onJumpToCluster}
            style={{
              borderRadius: tokens.radius.pill,
              border: `1px solid ${T.line}`,
              background: "transparent",
              padding: "4px 8px",
              fontSize: 10,
              fontWeight: 700,
              color: T.soft,
              cursor: "pointer"
            }}
          >
            ← back to cluster
          </button>
        </div>
        {leadEvidence.length ? (
          <div style={{ fontSize: 12, color: T.soft, lineHeight: 1.6, ...WRAP_ANYWHERE }}>
            Read the examples first, then use the technique notes below to explain what the cluster is doing.
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 10 }}>
          {detail.audienceEvidence.length ? detail.audienceEvidence.map((evidence, index) => (
            <div
              key={evidence.commentId || index}
              style={{
                paddingLeft: 14,
                paddingBottom: index < detail.audienceEvidence.length - 1 ? 10 : 0,
                borderLeft: `3px solid ${index === 0 ? T.accent : T.line}`,
                borderBottom: index < detail.audienceEvidence.length - 1 ? `1px solid ${T.line}` : "none",
                display: "grid",
                gap: 6
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>@{evidence.author || "anon"}</span>
                <span style={{ fontSize: 10, color: T.soft }}>{evidence.commentId || ""}</span>
              </div>
              <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6, ...WRAP_ANYWHERE }}>{evidencePreview(evidence.text)}</div>
              <EvidenceMetricRow
                metrics={{
                  likes: evidence.likes,
                  comments: evidence.comments,
                  reposts: evidence.reposts,
                  forwards: evidence.forwards
                }}
              />
            </div>
          )) : (
            <div style={{ fontSize: 12, color: T.soft }}>Low-signal cluster. Not enough audience evidence yet.</div>
          )}
        </div>
      </div>

      {/* Technique notes — selective swipe cards */}
      <div data-technique-notes="cluster-specific" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.soft, letterSpacing: "0.03em" }}>
          Technique notes
        </div>
        {notesToRender.length ? (
          <>
            <div
              data-technique-carousel="swipe-cards"
              style={{
                display: "grid",
                gridAutoFlow: "column",
                gridAutoColumns: "85%",
                gap: 12,
                overflowX: "auto",
                scrollSnapType: "x mandatory",
                scrollbarWidth: "none"
              }}
            >
              {notesToRender.map((technique, index) => {
                const accent = TECHNIQUE_ACCENTS[index % TECHNIQUE_ACCENTS.length];
                return (
                  <article
                    key={technique.key}
                    data-technique-card={technique.key}
                    style={{
                      scrollSnapAlign: "start",
                      borderRadius: tokens.radius.card,
                      border: `1px solid ${T.line}`,
                      borderLeft: `3px solid ${accent}`,
                      background: tokens.color.contentSurface,
                      boxShadow: tokens.shadow.focus,
                      padding: "14px 14px 16px",
                      display: "grid",
                      gap: 12
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTechniqueKey(technique.key)}
                      style={{
                        display: "grid",
                        gap: 6,
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer"
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{technique.title}</span>
                        {technique.alias ? (
                          <span style={{ fontSize: 11, fontWeight: 500, color: T.soft }}>{technique.alias}</span>
                        ) : null}
                      </span>
                      <span style={{ fontSize: 13, color: T.sub, lineHeight: 1.7, ...WRAP_ANYWHERE }}>{technique.summary}</span>
                    </button>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: accent }}>在這個 cluster</div>
                        <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.75, ...WRAP_ANYWHERE }}>{technique.clusterFit}</div>
                      </div>
                      {technique.whyItMatters ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.soft }}>為什麼值得注意</div>
                          <div style={{ fontSize: 12, color: T.soft, lineHeight: 1.7, ...WRAP_ANYWHERE }}>{technique.whyItMatters}</div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            <div data-technique-dots="visible" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {notesToRender.map((technique, index) => {
                const accent = TECHNIQUE_ACCENTS[index % TECHNIQUE_ACCENTS.length];
                const active = technique.key === activeTechniqueKey;
                return (
                  <span
                    key={technique.key}
                    style={{
                      width: active ? 14 : 6,
                      height: 6,
                      borderRadius: tokens.radius.pill,
                      background: active ? accent : T.line,
                      transition: tokens.motion.interactiveTransitionFast
                    }}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </div>

    </div>
  );
}
