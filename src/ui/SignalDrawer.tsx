import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { EvidencePacket, SignalReading } from "../compare/topic-audit.ts";
import { DEFAULT_POPUP_WIDTH } from "../state/processing-state.ts";
import {
  buildEvidenceFragmentLookup,
  computeCitationPopoverLayout,
  EvidenceRefChip,
  evidenceRoleLabel,
  tokenizeEvidenceProse,
  type EvidenceFragmentLookup
} from "./EvidenceRefChip.tsx";
import { tokens } from "./tokens";
import { GhostButton } from "./topic-audit-components.tsx";

const AVATAR_BACKGROUNDS = [
  tokens.topicAccent.tintSageHi,
  tokens.topicAccent.tintAmber,
  tokens.color.accentSoft,
  tokens.color.queuedSoft,
  tokens.color.successSoft
] as const;

export { computeCitationPopoverLayout };

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BACKGROUNDS[hash % AVATAR_BACKGROUNDS.length];
}

function ThreadsStyleFragment({
  fragment,
  highlighted
}: {
  fragment: EvidenceFragmentLookup;
  highlighted: boolean;
}) {
  const isOp = fragment.role === "op";
  const isOpContinuation = fragment.role === "op_continuation";
  const indent = !isOp; // OP at root, continuations + replies indent
  const roleAccent = isOp
    ? tokens.topicAccent.primary
    : isOpContinuation
      ? tokens.topicAccent.warm
      : tokens.color.softInk;
  return (
    <div
      data-raw-fragment={fragment.ref}
      data-highlight={highlighted ? "true" : "false"}
      style={{
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr)",
        gap: 8,
        paddingLeft: indent ? 14 : 0,
        position: "relative",
        outline: highlighted ? `2px solid ${tokens.topicAccent.warm}` : "none",
        outlineOffset: 3,
        borderRadius: 8
      }}
    >
      {indent ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 4,
            top: 4,
            bottom: 4,
            width: 1.5,
            background: tokens.color.line,
            borderRadius: 1
          }}
        />
      ) : null}
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: avatarColor(fragment.author),
          color: tokens.color.elevated,
          fontFamily: tokens.font.sans,
          fontSize: 11,
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {(fragment.author || "?").slice(0, 1).toUpperCase()}
      </span>
      <div style={{ minWidth: 0, paddingTop: 2 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: tokens.color.ink }}>@{fragment.author}</span>
          <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: roleAccent, fontWeight: 700 }}>{fragment.ref}</span>
          <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>{evidenceRoleLabel(fragment.role)}</span>
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: tokens.color.subInk,
            fontStyle: isOpContinuation ? "italic" : "normal",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {fragment.text}
        </div>
        <div style={{ marginTop: 4, fontSize: 10.5, color: tokens.color.softInk, fontFamily: tokens.font.mono }}>
          ♥ {fragment.likes ?? "?"}
        </div>
      </div>
    </div>
  );
}

function OriginalPostCard({
  fragment,
  capturedAt,
  commentCount,
  highlighted
}: {
  fragment: EvidenceFragmentLookup;
  capturedAt: string;
  commentCount: number | null;
  highlighted: boolean;
}) {
  const displayDate = new Intl.DateTimeFormat("zh-HK", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(capturedAt));
  return (
    <section
      data-signal-drawer-block="op-card"
      data-highlight={highlighted ? "true" : "false"}
      style={{
        background: highlighted ? tokens.color.elevated : `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.topicAccent.tintSage})`,
        border: `1px solid ${highlighted ? tokens.topicAccent.warm : tokens.topicAccent.primaryGlow}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "38px minmax(0, 1fr)",
        gap: 11,
        boxShadow: tokens.shadow.card
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          borderRadius: 999,
          background: avatarColor(fragment.author),
          color: tokens.color.elevated,
          fontFamily: tokens.font.sans,
          fontSize: 15,
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {(fragment.author || "?").slice(0, 1).toUpperCase()}
      </span>
      <div style={{ minWidth: 0 }}>
        <div data-signal-drawer-source-kicker="true" style={{ fontFamily: tokens.font.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: tokens.topicAccent.primary, marginBottom: 5 }}>
          原文 · 最高權重
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: tokens.color.ink }}>@{fragment.author}</span>
          <span style={{ fontSize: 11, color: tokens.color.softInk }}>{displayDate}</span>
          <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.topicAccent.primary, fontWeight: 700, letterSpacing: "0.04em" }}>{fragment.ref}</span>
        </div>
        <div
          style={{
            marginTop: 7,
            fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
            fontSize: 16,
            lineHeight: 1.6,
            color: tokens.color.ink,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {fragment.text}
        </div>
        <div style={{ marginTop: 9, display: "flex", gap: 14, fontSize: 11, color: tokens.color.softInk, fontFamily: tokens.font.mono }}>
          <span>♥ {fragment.likes ?? "?"}</span>
          <span>💬 {commentCount ?? "?"}</span>
        </div>
      </div>
    </section>
  );
}

function Caveats({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div
      data-signal-drawer-caveats="true"
      style={{
        padding: "10px 14px 11px",
        background: tokens.color.queuedWash,
        borderLeft: `3px solid ${tokens.topicAccent.warm}`,
        borderRadius: "0 8px 8px 0",
        fontSize: 12,
        lineHeight: 1.65,
        color: tokens.color.subInk,
        display: "grid",
        gap: 3
      }}
    >
      <div style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.topicAccent.warm, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        ⚠ 待驗證
      </div>
      {items.map((item, index) => (
        <div key={`${item}-${index}`}>{item}</div>
      ))}
    </div>
  );
}

export function SignalDrawer({
  packet,
  reading,
  topicName,
  onClose,
  onGenerateReading,
  readingPending = false
}: {
  packet: EvidencePacket;
  reading?: SignalReading | null;
  topicName: string;
  onClose: () => void;
  onGenerateReading?: () => void;
  readingPending?: boolean;
}) {
  const fragmentLookup = useMemo(() => buildEvidenceFragmentLookup(packet), [packet]);
  const allFragments = useMemo<EvidenceFragmentLookup[]>(() => [...fragmentLookup.values()], [fragmentLookup]);
  const [pinnedRef, setPinnedRef] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  // Auto-generate the P1 reading once per opened signal so the drawer is not a
  // dead end; a failed attempt falls back to the manual button (no retry loop).
  const autoGenAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (reading || readingPending || !onGenerateReading) return;
    if (autoGenAttemptedRef.current === packet.signalId) return;
    autoGenAttemptedRef.current = packet.signalId;
    onGenerateReading();
  }, [packet.signalId, reading, readingPending, onGenerateReading]);

  const handlePin = (ref: string) => {
    setPinnedRef((current) => {
      if (current === ref) {
        return null;
      }
      setRawOpen(true);
      return ref;
    });
  };

  const proseTokens = useMemo(
    () => reading ? tokenizeEvidenceProse(reading.reading) : [],
    [reading]
  );
  const hasInlineRefs = useMemo(() => proseTokens.some((token) => token.kind === "cite"), [proseTokens]);

  const audienceReplies = packet.replyFragments.filter((fragment) => fragment.role === "audience");
  const opContinuations = packet.replyFragments.filter((fragment) => fragment.role === "op_continuation");
  const opReplies = packet.replyFragments.filter((fragment) => fragment.role === "op_reply");
  const showDataGap = audienceReplies.length === 0 && (opContinuations.length > 0 || opReplies.length > 0);
  const opRef = `${packet.shortCode}.OP`;
  const opFragment = fragmentLookup.get(opRef);
  // OP root post is surfaced as an always-visible card up top; the collapsible
  // now holds the rest of the thread (OP continuations + OP replies + audience replies).
  const threadFragments = allFragments.filter((fragment) => fragment.ref !== opRef);
  const replyCount = packet.replyFragments.length;
  const displayDate = new Intl.DateTimeFormat("zh-HK", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(packet.capturedAt));

  return (
    <aside
      data-signal-drawer="topic-audit"
      style={{
        position: "fixed",
        right: 24,
        top: 82,
        width: DEFAULT_POPUP_WIDTH,
        maxWidth: "calc(100vw - 48px)",
        height: "min(86vh, 860px)",
        maxHeight: "min(86vh, 860px)",
        zIndex: 2147483642,
        borderRadius: tokens.radius.lg + 2,
        background: tokens.color.surface,
        boxShadow: tokens.shadow.topicDrawer,
        border: `1px solid ${tokens.color.line}`,
        display: "flex",
        flexDirection: "column",
        fontFamily: tokens.font.sans,
        color: tokens.color.ink,
        overflow: "hidden"
      }}
    >
      <header
        style={{
          padding: "13px 16px 11px",
          borderBottom: `1px solid ${tokens.color.line}`,
          background: tokens.color.elevated,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10
        }}
      >
        <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={{ fontFamily: tokens.font.mono, color: tokens.topicAccent.primary, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
            來源 {packet.shortCode} · 原帖
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
              fontSize: 20,
              lineHeight: 1.25,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {packet.opText ? packet.opText.replace(/\s+/g, " ").trim().slice(0, 42) : "原帖"}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: tokens.color.softInk, alignItems: "center" }}>
            <span style={{ color: tokens.color.subInk, fontWeight: 650 }}>@{packet.opAuthor || "unknown"}</span>
            <span style={{ color: tokens.color.lineStrong }}>·</span>
            <span>{displayDate}</span>
            <span style={{ color: tokens.color.lineStrong }}>·</span>
            <span>♥ {packet.opLikes ?? "?"}</span>
            <span style={{ color: tokens.color.lineStrong }}>·</span>
            <span>議題 {topicName}</span>
          </div>
        </div>
        <GhostButton onClick={onClose} style={{ padding: "6px 10px", fontSize: 11 }}>關閉</GhostButton>
      </header>

      <div
        data-signal-drawer-body="true"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 24px 24px",
          display: "grid",
          gap: 14,
          alignContent: "start",
          gridAutoRows: "max-content",
          gridTemplateColumns: "minmax(0, 640px)",
          justifyContent: "center"
        }}
      >
        {opFragment ? (
          <OriginalPostCard
            fragment={opFragment}
            capturedAt={packet.capturedAt}
            commentCount={packet.commentCount}
            highlighted={pinnedRef === opRef}
          />
        ) : null}

        {reading ? (
          <section
            data-signal-drawer-block="p1"
            style={{
              background: tokens.color.elevated,
              border: `1px solid ${tokens.color.line}`,
              borderRadius: 12,
              padding: "16px 16px",
              boxShadow: tokens.shadow.card
            }}
          >
            <div
              style={{
                fontFamily: tokens.font.mono,
                fontSize: 10,
                color: tokens.topicAccent.primary,
                letterSpacing: "0.08em",
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 8
              }}
            >
              <span aria-hidden="true" style={{ width: 16, height: 1.5, background: tokens.topicAccent.primary }} />
              P1 判讀 · cold-read
            </div>
            <div
              data-p1-prose="true"
              style={{
                fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
                fontSize: 14,
                lineHeight: 1.9,
                color: tokens.color.ink,
                letterSpacing: "0.005em"
              }}
            >
              {proseTokens.map((token, index): ReactNode => {
                if (token.kind === "text") {
                  return <span key={`t-${index}`}>{token.value}</span>;
                }
                return (
                  <EvidenceRefChip
                    key={`c-${index}-${token.value}`}
                    refId={token.value}
                    fragment={fragmentLookup.get(token.value)}
                    pinned={pinnedRef === token.value}
                    onPin={handlePin}
                    variant="drawer"
                  />
                );
              })}
            </div>
            {hasInlineRefs ? null : reading.evidenceRefs.length > 0 ? (
              <div
                data-evidence-refs-fallback="true"
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: `1px dashed ${tokens.color.line}`,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 6
                }}
              >
                <span style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.softInk, letterSpacing: "0.04em" }}>引用 →</span>
                {reading.evidenceRefs.map((ref) => (
                  <EvidenceRefChip
                    key={ref}
                    refId={ref}
                    fragment={fragmentLookup.get(ref)}
                    pinned={pinnedRef === ref}
                    onPin={handlePin}
                    variant="drawer"
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <section
            data-signal-drawer-block="p1-missing"
            style={{
              background: tokens.color.contextSurface,
              border: `1px dashed ${tokens.color.line}`,
              borderRadius: 12,
              padding: "18px 20px",
              fontSize: 12.5,
              lineHeight: 1.65,
              color: tokens.color.subInk,
              display: "grid",
              gap: 10,
              justifyItems: "start"
            }}
          >
            {readingPending ? (
              <>
                <strong style={{ color: tokens.color.ink }}>P1 判讀生成中…</strong>
                <span>正在白紙閱讀本篇原文與 {replyCount} 則留言，完成後此處會顯示帶 inline 引用的判讀 prose。</span>
              </>
            ) : onGenerateReading ? (
              <>
                <strong style={{ color: tokens.color.ink }}>尚未生成 P1 判讀</strong>
                <span>P1 會白紙閱讀本篇原文與留言，產出可 hover 查證的判讀。開啟本頁時已自動嘗試；若未開始可手動生成。</span>
                <button
                  type="button"
                  data-signal-drawer-run-p1={packet.shortCode}
                  onClick={onGenerateReading}
                  style={{
                    border: `1px solid ${tokens.color.line}`,
                    borderRadius: tokens.radius.button,
                    background: tokens.color.surface,
                    color: tokens.topicAccent.primary,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: tokens.font.sans
                  }}
                >
                  生成 P1 判讀
                </button>
              </>
            ) : (
              <>
                <strong style={{ color: tokens.color.ink }}>尚未生成 P1 判讀</strong>
                <span>本篇尚未完成爬取或未設定 AI provider，暫時無法生成判讀。</span>
              </>
            )}
          </section>
        )}

        <Caveats items={reading?.watchNotes ?? []} />

        {threadFragments.length > 0 ? (
          <section data-signal-drawer-block="raw" style={{ display: "grid", gap: 10, alignSelf: "start" }}>
            <button
              type="button"
              data-raw-toggle="true"
              onClick={() => setRawOpen((current) => !current)}
              style={{
                width: "100%",
                background: "transparent",
                border: `1px dashed ${tokens.color.lineStrong}`,
                borderRadius: 8,
                padding: "9px 14px",
                minHeight: 40,
                fontFamily: tokens.font.mono,
                fontSize: 11,
                color: tokens.color.softInk,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                letterSpacing: "0.04em"
              }}
            >
              <span>留言串（{replyCount} 則）</span>
              <span aria-hidden="true" style={{ transform: rawOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms", display: "inline-block" }}>▾</span>
            </button>
            {rawOpen ? (
              <div
                data-raw-body="open"
                style={{
                  padding: "12px 12px",
                  background: tokens.color.elevated,
                  borderRadius: 10,
                  border: `1px solid ${tokens.color.line}`,
                  display: "grid",
                  gap: 12,
                  maxHeight: 320,
                  overflowY: "auto"
                }}
              >
                {threadFragments.map((fragment) => (
                  <ThreadsStyleFragment
                    key={fragment.ref}
                    fragment={fragment}
                    highlighted={pinnedRef === fragment.ref}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {showDataGap ? (
          <div
            data-signal-drawer-gap-note="true"
            style={{
              borderRadius: tokens.radius.card,
              background: tokens.topicAccent.tintAmber,
              color: tokens.topicAccent.warm,
              padding: "10px 12px",
              fontSize: 11.5,
              lineHeight: 1.55,
              fontWeight: 700
            }}
          >
            data-gap 不是 absence · long-tail commentCount = {packet.commentCount ?? "unknown"}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
