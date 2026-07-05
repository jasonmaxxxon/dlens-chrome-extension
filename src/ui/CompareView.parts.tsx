import { useState, type ReactNode } from "react";
import { EvidenceMetricRow } from "./components.tsx";
import { TOKENS, tokens } from "./tokens";

const AR = {
  blue: tokens.color.accent,
  orange: tokens.color.queued,
  card: tokens.color.elevated,
  ink: tokens.color.ink,
  softInk: tokens.color.subInk,
  muteInk: tokens.color.softInk,
  line: tokens.color.line
} as const;

export function SectionLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div style={{
      fontSize: 12,
      fontWeight: 600,
      color: color || TOKENS.softInk,
      letterSpacing: "0.02em",
      lineHeight: 1.4
    }}>
      {children}
    </div>
  );
}

function PartsSparkle({ color = AR.blue, size = 10 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2L13.8 9.2L21 11L13.8 12.8L12 20L10.2 12.8L3 11L10.2 9.2L12 2Z"/>
    </svg>
  );
}

function PartsChevron({ open }: { open: boolean }) {
  return (
    <svg width="11" height="7" viewBox="0 0 11 7" fill="none"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s" }}>
      <path d="M1 1L5.5 6L10 1" stroke={AR.muteInk} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function AnnotatedQuote({ text, marks, side }: {
  text: string;
  marks: { phrase: string; label: string }[];
  side: "A" | "B";
}) {
  const hlColor = side === "A" ? tokens.color.accentSoft : tokens.color.queuedSoft;
  const tagColor = side === "A" ? AR.blue : AR.orange;
  const parts: { text: string; highlight: boolean }[] = [];
  const sorted = [...marks].sort((a, b) => text.indexOf(a.phrase) - text.indexOf(b.phrase));
  let remaining = text;
  for (const mark of sorted) {
    const idx = remaining.indexOf(mark.phrase);
    if (idx === -1) continue;
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), highlight: false });
    parts.push({ text: mark.phrase, highlight: true });
    remaining = remaining.slice(idx + mark.phrase.length);
  }
  if (remaining) parts.push({ text: remaining, highlight: false });

  return (
    <div>
      <p style={{ fontSize: 13.5, lineHeight: 1.58, letterSpacing: 0, color: AR.ink, marginBottom: marks.length ? 9 : 0 }}>
        「{parts.map((part, index) => part.highlight
          ? <mark key={index} style={{ background: hlColor, borderRadius: 3, padding: "1px 2px", color: AR.ink, fontWeight: 600 }}>{part.text}</mark>
          : <span key={index}>{part.text}</span>
        )}」
      </p>
      {marks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 9 }}>
          {sorted.map((mark, index) => (
            <div key={index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: tagColor, fontFamily: "monospace" }}>「{mark.phrase}」</span>
              <div style={{ flex: 1, borderTop: `1px dotted ${AR.line}` }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: tagColor, background: side === "A" ? tokens.color.accentSoft : tokens.color.queuedSoft, borderRadius: 6, padding: "1.5px 7px" }}>{mark.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlankUserAvatar({ size = 22, dataAttr }: { size?: number; dataAttr?: string }) {
  const dataProps = dataAttr ? ({ [dataAttr]: "placeholder" } as Record<string, string>) : {};
  return (
    <span
      {...dataProps}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.neutralSurface})`,
        border: `1px solid ${tokens.color.idleBorder}`,
        color: tokens.color.softInk,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `inset 0 1px 0 ${tokens.color.inverseStrong}`
      }}
    >
      <svg width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.6" fill="currentColor" opacity="0.9" />
        <path d="M5.5 18.2c0-2.9 2.9-4.9 6.5-4.9s6.5 2 6.5 4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      </svg>
    </span>
  );
}

function CompoundLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: AR.muteInk, letterSpacing: 0, marginBottom: 2 }}>{label}</div>
      <p style={{ fontSize: 12, lineHeight: 1.55, letterSpacing: 0, color: AR.softInk, margin: 0 }}>{text}</p>
    </div>
  );
}

export function DictionaryCard({ rank, handle, quote, likes, replies, side, marks, analysis, effectiveness }: {
  rank: number;
  handle: string;
  quote: string;
  likes?: number | null;
  replies?: number | null;
  side: "A" | "B";
  marks: { phrase: string; label: string }[];
  analysis: string | null;
  effectiveness: { discussionFunction: string; relationToCluster: string; whyEffective: string } | null;
}) {
  const [exp, setExp] = useState(false);
  const cc = side === "A" ? AR.blue : AR.orange;
  const cb = side === "A" ? tokens.color.accentSoft : tokens.color.queuedSoft;
  const border = side === "A" ? AR.blue : AR.orange;
  const hasAnalysis = Boolean(analysis);
  const hasEffectiveness = effectiveness !== null
    && (effectiveness.discussionFunction.length > 0 || effectiveness.whyEffective.length > 0);

  return (
    <div
      data-compare-evidence-row="dictionary"
      style={{ background: AR.card, borderRadius: tokens.radius.card, overflow: "hidden", boxShadow: tokens.shadow.glass }}
    >
      <div style={{ padding: "12px 15px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `0.5px solid ${AR.line}` }}>
        <div style={{ width: 21, height: 21, borderRadius: "50%", background: cb, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: cc }}>#{rank}</span>
        </div>
        <BlankUserAvatar dataAttr="data-result-evidence-avatar" />
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 5 }}>
          <span style={{ fontSize: 11.5, color: AR.softInk, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{handle}</span>
          <EvidenceMetricRow
            metrics={{
              likes: likes ?? null,
              comments: replies ?? null,
              reposts: null,
              forwards: null
            }}
          />
        </div>
      </div>
      <div style={{ padding: hasAnalysis ? "12px 15px 0" : "12px 15px 12px" }}>
        <AnnotatedQuote text={quote} marks={marks} side={side} />
      </div>
      {hasAnalysis && (
        <div style={{ margin: "0 15px 12px", borderLeft: `2.5px solid ${border}`, paddingLeft: 10 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: AR.muteInk, letterSpacing: 0, marginBottom: 4 }}>剖析</div>
          <p style={{ fontSize: 12, lineHeight: 1.55, letterSpacing: 0, color: AR.softInk, margin: 0 }}>{analysis}</p>
        </div>
      )}
      {hasEffectiveness && (
        <>
          <button onClick={() => setExp((value) => !value)} style={{ width: "100%", background: tokens.color.inkWash, border: "none", borderTop: `0.5px solid ${tokens.color.cardEdge}`, cursor: "pointer", padding: "8px 15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <PartsSparkle color={cc} size={9} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: cc }}>為什麼被挑出來</span>
            </div>
            <PartsChevron open={exp} />
          </button>
          {exp && effectiveness && (
            <div style={{ padding: "9px 15px 13px", background: tokens.color.inkWash, display: "grid", gap: 8 }}>
              <CompoundLine label="在討論中" text={effectiveness.discussionFunction} />
              {effectiveness.relationToCluster && (
                <CompoundLine label="跟主群組" text={effectiveness.relationToCluster} />
              )}
              <CompoundLine label="修辭效果" text={effectiveness.whyEffective} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
