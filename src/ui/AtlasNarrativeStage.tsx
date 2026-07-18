import { useEffect, useMemo, useState, type MouseEvent } from "react";

import type { EvidencePacket } from "../compare/topic-audit.ts";
import { pickRepresentativeNarrativeEvidence } from "../viewmodel/narrative-lane-detail.ts";
import { EvidenceRefChip, type EvidenceFragmentLookup } from "./EvidenceRefChip.tsx";
import { textStyles, tokens } from "./tokens.ts";
import type { NarrativeLaneHint } from "./topic-audit-components.tsx";

export interface AtlasNarrativeStageProps {
  lanes: NarrativeLaneHint[];
  packets: EvidencePacket[];
  postTotal: number;
  selectedLaneId: string | null;
  pinnedRef: string | null;
  fragmentLookup: Map<string, EvidenceFragmentLookup>;
  onSelectLane: (id: string) => void;
  onPinRef: (ref: string) => void;
}

const TRAJECTORY_LABEL = {
  new: "新線",
  carried: "延續"
} as const;

function isValidTrajectory(value: NarrativeLaneHint["trajectory"]): value is keyof typeof TRAJECTORY_LABEL {
  return value === "new" || value === "carried";
}

export function AtlasNarrativeStage({
  lanes,
  packets,
  postTotal,
  selectedLaneId,
  pinnedRef,
  fragmentLookup,
  onSelectLane,
  onPinRef
}: AtlasNarrativeStageProps) {
  const pages = useMemo(() => lanes.filter((lane) => !lane.isSinglePostObservation), [lanes]);
  const observations = useMemo(() => lanes.filter((lane) => Boolean(lane.isSinglePostObservation)), [lanes]);
  const pageKey = pages.map((lane) => lane.id).join("\u0000");
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, pages.length - 1);
  const visiblePage = Math.min(page, lastPage);
  const lane = pages[visiblePage] ?? null;

  useEffect(() => {
    setPage((current) => Math.min(current, lastPage));
  }, [lastPage, pageKey]);

  const handlePagerClick = (event: MouseEvent<HTMLButtonElement>, nextPage: number) => {
    event.stopPropagation();
    setPage(nextPage);
  };

  const renderRefs = (refs: ReadonlyArray<string>) => refs.slice(0, 3).map((ref) => (
    <EvidenceRefChip
      key={ref}
      refId={ref}
      fragment={fragmentLookup.get(ref)}
      pinned={pinnedRef === ref}
      onPin={onPinRef}
      variant="atlas"
    />
  ));

  const quote = lane ? pickRepresentativeNarrativeEvidence({ lane, packets }) : null;

  return (
    <section
      data-topic-audit-block="lanes"
      data-atlas-narrative-pager="true"
      style={{
        display: "grid",
        gap: tokens.spacing.sm,
        padding: tokens.spacing.section,
        borderRadius: tokens.radius.cardLg,
        border: `1px solid ${tokens.color.atlasEdge}`,
        background: tokens.color.atlasPaper,
        boxShadow: tokens.shadow.atlasCard,
        backdropFilter: tokens.effect.atlasBlur,
        WebkitBackdropFilter: tokens.effect.atlasBlur
      }}
    >
      <style>{`
        @media (max-width: ${tokens.layout.atlasNarrowBreakpointPx}px) {
          [data-narrative-beats] { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (prefers-reduced-motion: no-preference) {
          [data-atlas-narrative-page] {
            animation: dlens-slide-in ${tokens.motion.duration.slow} ${tokens.motion.easing.entrance} both;
          }
        }
      `}</style>

      {lane ? (
        <>
          <button
            key={lane.id}
            type="button"
            data-atlas-narrative-page={lane.id}
            data-narrative-lane={lane.id}
            data-active={selectedLaneId === lane.id ? "true" : "false"}
            onClick={() => onSelectLane(lane.id)}
            style={{
              display: "grid",
              gap: tokens.spacing.md,
              minWidth: 0,
              padding: 0,
              border: "none",
              background: "none",
              color: tokens.color.ink,
              textAlign: "left",
              fontFamily: tokens.font.sans,
              cursor: "pointer"
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: tokens.spacing.sm, minWidth: 0 }}>
              <span style={{ ...textStyles.cardTitle, minWidth: 0 }}>跨帖敘事：{lane.label}</span>
              {isValidTrajectory(lane.trajectory) ? (
                <span data-narrative-trajectory={lane.trajectory} style={{ ...textStyles.label, flexShrink: 0, color: tokens.color.queuedDeep }}>
                  {TRAJECTORY_LABEL[lane.trajectory]}
                </span>
              ) : null}
            </span>

            <span data-narrative-participation={lane.id} style={{ display: "grid", gap: tokens.spacing.xs }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: tokens.spacing.sm }}>
                <span style={{ ...textStyles.caption, color: tokens.color.softInk }}>跨帖參與</span>
                <span data-narrative-lane-metric={lane.id} style={{ ...textStyles.metric, color: tokens.color.queued }}>
                  {lane.metricLabel ?? `跨 ${lane.crossPostCount ?? lane.signalRefs.length}/${postTotal} 篇`}
                </span>
              </span>
              <span aria-hidden="true" style={{ display: "block", height: tokens.spacing.xs, overflow: "hidden", borderRadius: tokens.radius.round, background: tokens.color.neutralSurface }}>
                <span
                  data-narrative-participation-fill={lane.id}
                  style={{
                    display: "block",
                    width: `${Math.min(100, ((lane.crossPostCount ?? lane.signalRefs.length) / Math.max(1, postTotal)) * 100)}%`,
                    height: "100%",
                    borderRadius: tokens.radius.round,
                    background: tokens.color.queued
                  }}
                />
              </span>
            </span>

            {lane.beats?.setup && lane.beats.tension && lane.beats.outcome ? (
              <span data-narrative-beats={lane.id} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: tokens.spacing.sm }}>
                {[
                  ["起", lane.beats.setup],
                  ["張力", lane.beats.tension],
                  ["收束", lane.beats.outcome]
                ].map(([label, text]) => (
                  <span key={label} style={{ display: "grid", alignContent: "start", gap: tokens.spacing.xs, minWidth: 0 }}>
                    <span style={{ ...textStyles.label, color: tokens.color.signalDeep }}>{label}</span>
                    <span style={{ ...textStyles.bodyTight, color: tokens.color.subInk }}>{text}</span>
                  </span>
                ))}
              </span>
            ) : null}

            {quote ? (
              <span
                data-narrative-representative-ref={quote.ref}
                style={{ display: "grid", gap: tokens.spacing.xs, paddingLeft: tokens.spacing.md, borderLeft: `1px solid ${tokens.color.signalGlow}` }}
              >
                <span style={{ ...textStyles.quote, color: tokens.color.ink }}>「{quote.text}」</span>
                <span style={{ ...textStyles.metric, color: tokens.color.softInk }}>@{quote.author} · ♥ {quote.likes ?? "?"} · {quote.ref}</span>
              </span>
            ) : null}

            <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacing.xs }}>
              {renderRefs(lane.signalRefs)}
            </span>
          </button>

          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacing.sm }}>
            <button
              type="button"
              data-atlas-narrative-previous="true"
              aria-label="上一條跨帖敘事"
              disabled={visiblePage === 0}
              onClick={(event) => handlePagerClick(event, Math.max(0, visiblePage - 1))}
              style={{ border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.button, background: tokens.color.surface, color: tokens.color.subInk, padding: `${tokens.spacing.xs}px ${tokens.spacing.sm}px`, cursor: visiblePage === 0 ? "not-allowed" : "pointer", fontFamily: tokens.font.sans }}
            >
              ←
            </button>
            <span aria-live="polite" aria-atomic="true" style={{ ...textStyles.metric, color: tokens.color.softInk }}>
              {visiblePage + 1} / {pages.length}
            </span>
            <button
              type="button"
              data-atlas-narrative-next="true"
              aria-label="下一條跨帖敘事"
              disabled={visiblePage === lastPage}
              onClick={(event) => handlePagerClick(event, Math.min(lastPage, visiblePage + 1))}
              style={{ border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.button, background: tokens.color.surface, color: tokens.color.subInk, padding: `${tokens.spacing.xs}px ${tokens.spacing.sm}px`, cursor: visiblePage === lastPage ? "not-allowed" : "pointer", fontFamily: tokens.font.sans }}
            >
              →
            </button>
          </span>
        </>
      ) : null}

      {observations.length > 0 ? (
        <span style={{ display: "grid", gap: tokens.spacing.xs }}>
          {observations.map((observation) => (
            <button
              key={observation.id}
              type="button"
              data-atlas-single-observation={observation.id}
              data-narrative-lane={observation.id}
              data-active={selectedLaneId === observation.id ? "true" : "false"}
              onClick={() => onSelectLane(observation.id)}
              style={{ display: "flex", alignItems: "baseline", gap: tokens.spacing.sm, minWidth: 0, padding: `${tokens.spacing.xs}px 0`, border: "none", background: "none", textAlign: "left", cursor: "pointer", fontFamily: tokens.font.sans }}
            >
              <span data-narrative-lane-metric={observation.id} style={{ ...textStyles.caption, flexShrink: 0, color: tokens.color.softInk }}>單帖觀察</span>
              <span style={{ ...textStyles.bodyTight, minWidth: 0, flex: 1, color: tokens.color.subInk }}>{observation.label}</span>
              <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacing.xs }}>{renderRefs(observation.signalRefs)}</span>
            </button>
          ))}
        </span>
      ) : null}
    </section>
  );
}
