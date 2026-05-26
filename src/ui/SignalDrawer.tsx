import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { EvidencePacket, ReplyFragment, SignalReading } from "../compare/topic-audit.ts";
import { DEFAULT_POPUP_WIDTH } from "../state/processing-state.ts";
import { tokens } from "./tokens";
import { GhostButton } from "./topic-audit-components.tsx";

const ROLE_LABEL: Record<ReplyFragment["role"] | "op", string> = {
  op: "OP 原文",
  op_continuation: "OP 接話",
  audience: "留言",
  placeholder: "留言"
};

interface FragmentLookup {
  ref: string;
  author: string;
  text: string;
  likes: number | null;
  role: ReplyFragment["role"] | "op";
}

const CITATION_GROUP_PATTERN = /\[(S\d+\.(?:OPC\d+|OP|R\d+|P\d+)(?:\s*,\s*S\d+\.(?:OPC\d+|OP|R\d+|P\d+))*)\]/g;
const CITATION_REF_PATTERN = /S\d+\.(?:OPC\d+|OP|R\d+|P\d+)/g;
const CITATION_POPOVER_WIDTH = 320;
const CITATION_POPOVER_HEIGHT = 156;
const CITATION_POPOVER_MARGIN = 12;
const CITATION_POPOVER_GAP = 10;

interface CitationPopoverRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

interface CitationPopoverViewport {
  width: number;
  height: number;
}

interface CitationPopoverLayoutOptions {
  popoverWidth?: number;
  popoverHeight?: number;
  margin?: number;
  gap?: number;
}

export interface CitationPopoverLayout {
  left: number;
  top: number;
  width: number;
  arrowLeft: number;
  placement: "top" | "bottom";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeCitationPopoverLayout(
  anchor: CitationPopoverRect,
  viewport: CitationPopoverViewport,
  options: CitationPopoverLayoutOptions = {}
): CitationPopoverLayout {
  const margin = options.margin ?? CITATION_POPOVER_MARGIN;
  const gap = options.gap ?? CITATION_POPOVER_GAP;
  const popoverHeight = options.popoverHeight ?? CITATION_POPOVER_HEIGHT;
  const availableWidth = Math.max(160, viewport.width - margin * 2);
  const width = Math.min(options.popoverWidth ?? CITATION_POPOVER_WIDTH, availableWidth);
  const anchorCenter = anchor.left + anchor.width / 2;
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const left = clamp(anchorCenter - width / 2, margin, maxLeft);
  const topRoom = anchor.top - margin;
  const bottomRoom = viewport.height - margin - anchor.bottom;
  const placement = topRoom >= popoverHeight + gap || topRoom >= bottomRoom ? "top" : "bottom";
  const maxTop = Math.max(margin, viewport.height - popoverHeight - margin);
  const top = placement === "top"
    ? clamp(anchor.top - popoverHeight - gap, margin, maxTop)
    : clamp(anchor.bottom + gap, margin, maxTop);

  return {
    left,
    top,
    width,
    arrowLeft: clamp(anchorCenter - left, 12, width - 12),
    placement
  };
}

function buildFragmentLookup(packet: EvidencePacket): Map<string, FragmentLookup> {
  const map = new Map<string, FragmentLookup>();
  map.set(`${packet.shortCode}.OP`, {
    ref: `${packet.shortCode}.OP`,
    author: packet.opAuthor || "unknown",
    text: packet.opText || "OP 內容不可得",
    likes: packet.opLikes,
    role: "op"
  });
  for (const fragment of packet.replyFragments) {
    map.set(fragment.ref, {
      ref: fragment.ref,
      author: fragment.author || "unknown",
      text: fragment.text,
      likes: fragment.likes,
      role: fragment.role
    });
  }
  return map;
}

interface CitationToken {
  kind: "text" | "cite";
  value: string;
}

function tokenizeProse(prose: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  let cursor = 0;
  for (const match of prose.matchAll(CITATION_GROUP_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: prose.slice(cursor, start) });
    }
    const refs = match[1].match(CITATION_REF_PATTERN) ?? [];
    refs.forEach((ref, index) => {
      if (index > 0) {
        tokens.push({ kind: "text", value: " " });
      }
      tokens.push({ kind: "cite", value: ref });
    });
    cursor = start + match[0].length;
  }
  if (cursor < prose.length) {
    tokens.push({ kind: "text", value: prose.slice(cursor) });
  }
  return tokens;
}

function CitationChip({
  refId,
  fragment,
  pinned,
  onPin
}: {
  refId: string;
  fragment: FragmentLookup | undefined;
  pinned: boolean;
  onPin: (ref: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<CitationPopoverLayout | null>(null);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const hideHandle = useRef<number | null>(null);
  const showPopover = hover || pinned;
  const baseBg = pinned ? tokens.topicAccent.tintAmber : tokens.topicAccent.tintSage;
  const baseColor = pinned ? tokens.topicAccent.warm : tokens.topicAccent.primaryDeep;
  const baseBorder = pinned ? "#e8c89b" : "#d3e0ca";
  const hoverBg = pinned ? tokens.topicAccent.tintAmber : tokens.topicAccent.primary;
  const hoverColor = pinned ? tokens.topicAccent.warm : tokens.color.elevated;

  const clearHideHandle = () => {
    if (hideHandle.current !== null && typeof window !== "undefined") {
      window.clearTimeout(hideHandle.current);
      hideHandle.current = null;
    }
  };

  const updatePopoverLayout = () => {
    if (!chipRef.current || typeof window === "undefined") {
      return;
    }
    const rect = chipRef.current.getBoundingClientRect();
    setPopoverLayout(computeCitationPopoverLayout(
      {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width
      },
      { width: window.innerWidth, height: window.innerHeight }
    ));
  };

  useEffect(() => {
    if (!showPopover) {
      setPopoverLayout(null);
      return undefined;
    }
    updatePopoverLayout();
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleViewportChange = () => updatePopoverLayout();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showPopover, refId]);

  useEffect(() => () => clearHideHandle(), []);

  const tooltip = showPopover && fragment && popoverLayout && typeof document !== "undefined"
    ? createPortal(
        <span
          data-dlens-control="true"
          data-citation-popover={refId}
          data-placement={popoverLayout.placement}
          role="tooltip"
          onMouseEnter={() => {
            clearHideHandle();
            setHover(true);
          }}
          onMouseLeave={() => setHover(false)}
          style={{
            position: "fixed",
            top: popoverLayout.top,
            left: popoverLayout.left,
            width: popoverLayout.width,
            maxHeight: "min(240px, calc(100vh - 24px))",
            overflowY: "auto",
            background: "#1f2620",
            color: tokens.color.elevated,
            borderRadius: 10,
            padding: "10px 12px",
            fontFamily: tokens.font.sans,
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.6,
            letterSpacing: 0,
            zIndex: 2147483647,
            boxShadow: "0 14px 28px rgba(0,0,0,0.28)",
            textAlign: "left",
            pointerEvents: "auto",
            whiteSpace: "normal"
          }}
        >
          <span style={{ display: "flex", justifyContent: "space-between", fontFamily: tokens.font.mono, fontSize: 10, color: "rgba(250,247,238,0.6)", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: tokens.color.elevated }}>@{fragment.author}</span>
            <span>♥ {fragment.likes ?? "?"}</span>
          </span>
          <span style={{ display: "block", color: tokens.color.elevated }}>{fragment.text}</span>
          <span style={{ display: "block", marginTop: 6, fontFamily: tokens.font.mono, fontSize: 9.5, color: "rgba(250,247,238,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {ROLE_LABEL[fragment.role] ?? fragment.role}
          </span>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: popoverLayout.arrowLeft,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              ...(popoverLayout.placement === "top"
                ? { top: "100%", borderTop: "6px solid #1f2620" }
                : { bottom: "100%", borderBottom: "6px solid #1f2620" })
            }}
          />
        </span>,
        document.body
      )
    : null;

  return (
    <span
      ref={chipRef}
      data-citation-chip={refId}
      data-pinned={pinned ? "true" : "false"}
      onMouseEnter={() => {
        clearHideHandle();
        setHover(true);
      }}
      onMouseLeave={() => {
        clearHideHandle();
        if (typeof window === "undefined") {
          setHover(false);
          return;
        }
        hideHandle.current = window.setTimeout(() => {
          setHover(false);
          hideHandle.current = null;
        }, 80);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPin(refId);
      }}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        fontFamily: tokens.font.mono,
        fontSize: 10.5,
        fontWeight: 700,
        padding: "1px 7px",
        margin: "0 2px",
        borderRadius: 5,
        background: hover && !pinned ? hoverBg : baseBg,
        color: hover && !pinned ? hoverColor : baseColor,
        border: `1px solid ${baseBorder}`,
        cursor: "pointer",
        verticalAlign: 1,
        transition: "background 120ms, color 120ms, border-color 120ms",
        lineHeight: 1.5
      }}
    >
      {refId}{pinned ? " 📌" : ""}
      {tooltip}
    </span>
  );
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 35% 78%)`;
}

function ThreadsStyleFragment({
  fragment,
  highlighted
}: {
  fragment: FragmentLookup;
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
          <span style={{ fontSize: 10.5, color: tokens.color.softInk }}>{ROLE_LABEL[fragment.role] ?? fragment.role}</span>
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

function Caveats({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div
      data-signal-drawer-caveats="true"
      style={{
        padding: "10px 14px 11px",
        background: "rgba(182,116,62,0.06)",
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
  onClose
}: {
  packet: EvidencePacket;
  reading?: SignalReading | null;
  topicName: string;
  onClose: () => void;
}) {
  const fragmentLookup = useMemo(() => buildFragmentLookup(packet), [packet]);
  const allFragments = useMemo<FragmentLookup[]>(() => [...fragmentLookup.values()], [fragmentLookup]);
  const [pinnedRef, setPinnedRef] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const handlePin = (ref: string) => {
    setPinnedRef((current) => {
      if (current === ref) {
        return null;
      }
      setRawOpen(true);
      return ref;
    });
  };

  const proseTokens: CitationToken[] = useMemo(
    () => reading ? tokenizeProse(reading.reading) : [],
    [reading]
  );
  const hasInlineRefs = useMemo(() => proseTokens.some((token) => token.kind === "cite"), [proseTokens]);

  const audienceReplies = packet.replyFragments.filter((fragment) => fragment.role === "audience");
  const opContinuations = packet.replyFragments.filter((fragment) => fragment.role === "op_continuation");
  const showDataGap = audienceReplies.length === 0 && opContinuations.length > 0;
  const fragmentCount = packet.replyFragments.length + 1;
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
            {packet.shortCode}.OP
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: `${tokens.font.serifCjk}, ${tokens.font.serif}`,
              fontSize: 20,
              lineHeight: 1.25,
              fontWeight: 500
            }}
          >
            Signal
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
        {reading ? (
          <section
            data-signal-drawer-block="p1"
            style={{
              background: tokens.color.elevated,
              border: `1px solid ${tokens.color.line}`,
              borderRadius: 12,
              padding: "16px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.03)"
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
                  <CitationChip
                    key={`c-${index}-${token.value}`}
                    refId={token.value}
                    fragment={fragmentLookup.get(token.value)}
                    pinned={pinnedRef === token.value}
                    onPin={handlePin}
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
                  <CitationChip
                    key={ref}
                    refId={ref}
                    fragment={fragmentLookup.get(ref)}
                    pinned={pinnedRef === ref}
                    onPin={handlePin}
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
              color: tokens.color.subInk
            }}
          >
            <strong style={{ color: tokens.color.ink }}>尚未生成 P1 判讀</strong>
            <br />
            點擊資料來源該行的「分析此篇」可生成。生成後此處會顯示帶有 inline citation 的判讀 prose。
          </section>
        )}

        <Caveats items={reading?.watchNotes ?? []} />

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
            <span>原文 · OP + 留言（{fragmentCount} fragments）</span>
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
              {allFragments.map((fragment) => (
                <ThreadsStyleFragment
                  key={fragment.ref}
                  fragment={fragment}
                  highlighted={pinnedRef === fragment.ref}
                />
              ))}
            </div>
          ) : null}
        </section>

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
