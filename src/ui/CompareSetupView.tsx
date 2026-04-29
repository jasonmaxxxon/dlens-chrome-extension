import type { SessionItem } from "../state/types.ts";
import { tokens } from "./tokens.ts";

const AR = {
  blue: tokens.color.accent,
  orange: tokens.color.queued,
  ink: tokens.color.ink,
  canvas: tokens.color.contentSurface,
  card: tokens.color.elevated,
  softInk: tokens.color.subInk,
  muteInk: tokens.color.softInk,
  line: tokens.color.line,
  green: tokens.color.success,
} as const;

export interface CompareSetupTeaser {
  headline: string;
  deck: string;
  metadataLabel: string;
  briefSource: "ai" | "fallback";
}

interface CompareSetupViewProps {
  readyItems: SessionItem[];
  selectedA: string;
  selectedB: string;
  teaserState: "idle" | "loading" | "ready";
  teaser: CompareSetupTeaser | null;
  onChangeA: (itemId: string) => void;
  onChangeB: (itemId: string) => void;
  onOpenResult: () => void;
  onReset: () => void;
}

function avatarInitial(author: string | null | undefined): string {
  if (!author) return "?";
  const clean = author.replace(/^@/, "");
  return clean.charAt(0).toUpperCase();
}

function PostMiniCard({ item, side }: { item: SessionItem | null | undefined; side: "A" | "B" }) {
  if (!item) return null;

  const accentColor = side === "A" ? AR.blue : AR.orange;
  const author = item.descriptor.author_hint || item.latestCapture?.author_hint || "Unknown";
  const snippet = item.descriptor.text_snippet || item.latestCapture?.text_snippet || "";
  const analysis = item.latestCapture?.analysis;
  const commentCount = analysis?.source_comment_count ?? item.commentsPreview.length;
  const topKeywords: string[] = analysis?.clusters?.[0]?.keywords?.slice(0, 3) ?? [];

  return (
    <div
      style={{
        background: AR.canvas,
        borderRadius: tokens.radius.card,
        padding: "9px 11px",
        borderLeft: `3px solid ${accentColor}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: tokens.radius.card,
            background: accentColor,
            color: tokens.color.elevated,
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {avatarInitial(author)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: AR.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{author}
          </div>
          {commentCount > 0 && (
            <div style={{ fontSize: 10, color: AR.muteInk }}>
              {commentCount} 則留言
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: accentColor,
            background: `${accentColor}14`,
            borderRadius: tokens.radius.sm,
            padding: "2px 7px",
            flexShrink: 0,
          }}
        >
          {side}
        </div>
      </div>

      {/* Snippet */}
      {snippet ? (
        <div
          style={{
            fontSize: 11,
            color: AR.softInk,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {snippet}
        </div>
      ) : null}

      {/* Keywords */}
      {topKeywords.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {topKeywords.map((kw) => (
            <span
              key={kw}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: AR.ink,
                background: AR.card,
                border: `1px solid ${AR.line}`,
                borderRadius: tokens.radius.sm,
                padding: "1px 6px",
              }}
            >
              {kw}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SelectorBlock({
  side,
  label,
  value,
  items,
  onChange,
  accentColor,
}: {
  side: "A" | "B";
  label: string;
  value: string;
  items: SessionItem[];
  onChange: (itemId: string) => void;
  accentColor: string;
}) {
  const selectedItem = value ? items.find((i) => i.id === value) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: accentColor,
            background: `${accentColor}14`,
            borderRadius: tokens.radius.sm,
            padding: "2px 8px",
          }}
        >
          {label}
        </div>
      </div>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          borderRadius: tokens.radius.card,
          border: `1.5px solid ${value ? accentColor : AR.line}`,
          background: AR.card,
          color: AR.ink,
          padding: "10px 12px",
          fontSize: 13,
          fontWeight: 600,
          outline: "none",
          appearance: "auto",
        }}
      >
        <option value="" disabled>選擇貼文…</option>
        {items.map((item, index) => (
          <option key={item.id} value={item.id}>
            {`#${index + 1} @${item.descriptor.author_hint || "Unknown"}`}
          </option>
        ))}
      </select>

      <PostMiniCard item={selectedItem} side={side} />
    </div>
  );
}

export function CompareSetupView({
  readyItems,
  selectedA,
  selectedB,
  teaserState,
  teaser,
  onChangeA,
  onChangeB,
  onOpenResult,
  onReset
}: CompareSetupViewProps) {
  const openDisabled = teaserState !== "ready" || !teaser;
  const bothSelected = Boolean(selectedA && selectedB);

  return (
    <div
      style={{
        padding: "14px 14px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: AR.canvas,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${AR.line}`,
        boxShadow: tokens.shadow.glass,
      }}
    >

      {/* Header */}
      <div
        style={{
          background: AR.card,
          borderRadius: tokens.radius.card,
          padding: "12px 14px",
          border: `1px solid ${AR.line}`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: AR.muteInk, letterSpacing: 0, marginBottom: 2 }}>
          比較
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: AR.ink, letterSpacing: 0 }}>
          選擇兩篇貼文
        </div>
        <div style={{ fontSize: 12, color: AR.softInk, marginTop: 3 }}>
          選好後系統會自動預覽分析 teaser
        </div>
      </div>

      {/* Selector cards */}
      <div
        style={{
          background: AR.card,
          borderRadius: tokens.radius.card,
          padding: "14px 14px",
          border: `1px solid ${AR.line}`,
          boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <SelectorBlock
          side="A"
          label="貼文 A"
          value={selectedA}
          items={readyItems}
          onChange={onChangeA}
          accentColor={AR.blue}
        />
        {/* Divider */}
        <div style={{ height: 1, background: AR.line, margin: "0 -2px" }} />
        <SelectorBlock
          side="B"
          label="貼文 B"
          value={selectedB}
          items={readyItems}
          onChange={onChangeB}
          accentColor={AR.orange}
        />
      </div>

      {/* Teaser card */}
      {bothSelected ? (
        <div
          data-compare-teaser-state={teaserState}
          style={{
            background: AR.card,
            borderRadius: tokens.radius.card,
            padding: "13px 14px",
            border: `1px solid ${AR.line}`,
            boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: AR.muteInk }}>分析預覽</div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: teaserState === "ready" ? AR.blue : teaserState === "loading" ? AR.muteInk : AR.muteInk,
                background: teaserState === "ready" ? "rgba(0,113,227,0.08)" : AR.canvas,
                borderRadius: tokens.radius.sm,
                padding: "2px 8px",
              }}
            >
              {teaserState === "ready" ? "AI Brief" : teaserState === "loading" ? "生成中…" : "等待中"}
            </span>
          </div>

          {teaserState === "loading" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ width: "70%", height: 22, borderRadius: tokens.radius.sm, background: AR.canvas }} />
              <div style={{ width: "100%", height: 12, borderRadius: tokens.radius.sm, background: AR.canvas }} />
              <div style={{ width: "80%", height: 12, borderRadius: tokens.radius.sm, background: AR.canvas }} />
            </div>
          ) : teaser ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  fontFamily: tokens.font.sans,
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: 0,
                  color: AR.ink,
                }}
              >
                {teaser.headline}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: AR.softInk,
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {teaser.deck}
              </div>
              <div style={{ fontSize: 10.5, color: AR.muteInk }}>{teaser.metadataLabel}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: AR.muteInk, lineHeight: 1.6 }}>
              選好兩篇貼文後，teaser 會自動生成。
            </div>
          )}
        </div>
      ) : null}

      {/* CTAs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onOpenResult}
          disabled={openDisabled}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: tokens.radius.card,
            border: "none",
            background: openDisabled ? AR.canvas : AR.blue,
            color: openDisabled ? AR.muteInk : tokens.color.elevated,
            fontSize: 14,
            fontWeight: 600,
            cursor: openDisabled ? "default" : "pointer",
            letterSpacing: 0,
          }}
        >
          查看完整分析
        </button>
        <button
          onClick={onReset}
          style={{
            width: "100%",
            padding: "9px 0",
            borderRadius: tokens.radius.card,
            border: `1px solid ${AR.line}`,
            background: AR.card,
            color: AR.ink,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: 0,
          }}
        >
          重新選擇
        </button>
      </div>
    </div>
  );
}
