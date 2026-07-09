import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { EvidencePacket, ReplyFragment } from "../compare/topic-audit.ts";
import { tokens } from "./tokens";

const ROLE_LABEL: Record<ReplyFragment["role"] | "op", string> = {
  op: "OP 原文",
  op_continuation: "OP 接話",
  op_reply: "OP 回覆",
  audience: "留言",
  placeholder: "留言"
};

export function evidenceRoleLabel(role: ReplyFragment["role"] | "op"): string {
  return ROLE_LABEL[role] ?? role;
}

export interface EvidenceFragmentLookup {
  ref: string;
  author: string;
  text: string;
  likes: number | null;
  role: ReplyFragment["role"] | "op";
}

const CITATION_GROUP_PATTERN = /\[(S\d+\.(?:OPC\d+|OPR\d+|OP|R\d+|P\d+)(?:\s*,\s*S\d+\.(?:OPC\d+|OPR\d+|OP|R\d+|P\d+))*)\]/g;
const CITATION_REF_PATTERN = /S\d+\.(?:OPC\d+|OPR\d+|OP|R\d+|P\d+)/g;
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

interface CitationToken {
  kind: "text" | "cite";
  value: string;
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

export function buildEvidenceFragmentLookup(packets: EvidencePacket | ReadonlyArray<EvidencePacket>): Map<string, EvidenceFragmentLookup> {
  const map = new Map<string, EvidenceFragmentLookup>();
  const list = Array.isArray(packets) ? packets : [packets];
  for (const packet of list) {
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
  }
  return map;
}

export function tokenizeEvidenceProse(prose: string): CitationToken[] {
  const out: CitationToken[] = [];
  let cursor = 0;
  for (const match of prose.matchAll(CITATION_GROUP_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      out.push({ kind: "text", value: prose.slice(cursor, start) });
    }
    const refs = match[1].match(CITATION_REF_PATTERN) ?? [];
    refs.forEach((ref, index) => {
      if (index > 0) out.push({ kind: "text", value: " " });
      out.push({ kind: "cite", value: ref });
    });
    cursor = start + match[0].length;
  }
  if (cursor < prose.length) {
    out.push({ kind: "text", value: prose.slice(cursor) });
  }
  return out;
}

export function evidenceRefsFromProse(prose: string): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const match of prose.matchAll(CITATION_REF_PATTERN)) {
    const ref = match[0];
    if (seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  return refs;
}

export function EvidenceRefChip({
  refId,
  fragment,
  pinned,
  onPin,
  variant = "drawer"
}: {
  refId: string;
  fragment: EvidenceFragmentLookup | undefined;
  pinned: boolean;
  onPin: (ref: string) => void;
  variant?: "drawer" | "atlas";
}) {
  const [hover, setHover] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<CitationPopoverLayout | null>(null);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const hideHandle = useRef<number | null>(null);
  const showPopover = hover || pinned;
  const atlas = variant === "atlas";
  const baseBg = atlas
    ? tokens.color.signalFaint
    : pinned ? tokens.topicAccent.tintAmber : tokens.topicAccent.tintSage;
  const baseColor = atlas
    ? tokens.color.signalDeep
    : pinned ? tokens.topicAccent.warm : tokens.topicAccent.primaryDeep;
  const baseBorder = atlas
    ? tokens.color.signalGlow
    : pinned ? tokens.topicAccent.tintAmber : tokens.topicAccent.tintSageHi;
  const hoverBg = atlas
    ? tokens.color.signal
    : pinned ? tokens.topicAccent.tintAmber : tokens.topicAccent.primary;
  const hoverColor = atlas
    ? tokens.color.dark
    : pinned ? tokens.topicAccent.warm : tokens.color.elevated;

  const clearHideHandle = () => {
    if (hideHandle.current !== null && typeof window !== "undefined") {
      window.clearTimeout(hideHandle.current);
      hideHandle.current = null;
    }
  };

  const updatePopoverLayout = () => {
    if (!chipRef.current || typeof window === "undefined") return;
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
    if (typeof window === "undefined") return undefined;
    const handleViewportChange = () => updatePopoverLayout();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showPopover, refId]);

  useEffect(() => () => clearHideHandle(), []);

  const popoverBg = atlas ? tokens.color.atlasPaperStrong : tokens.color.dark;
  const popoverFg = atlas ? tokens.color.ink : tokens.color.elevated;
  const popoverMuted = atlas ? tokens.color.softInk : tokens.color.inverseMuted;

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
            background: popoverBg,
            color: popoverFg,
            borderRadius: 10,
            padding: "10px 12px",
            fontFamily: tokens.font.sans,
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.6,
            letterSpacing: 0,
            zIndex: 2147483647,
            boxShadow: atlas ? tokens.shadow.atlasGlass : tokens.shadow.topicDrawer,
            border: atlas ? `1px solid ${tokens.color.atlasEdge}` : undefined,
            backdropFilter: atlas ? tokens.effect.atlasBlur : undefined,
            WebkitBackdropFilter: atlas ? tokens.effect.atlasBlur : undefined,
            textAlign: "left",
            pointerEvents: "auto",
            whiteSpace: "normal"
          }}
        >
          <span style={{ display: "flex", justifyContent: "space-between", fontFamily: tokens.font.mono, fontSize: 10, color: popoverMuted, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: popoverFg }}>@{fragment.author}</span>
            <span>♥ {fragment.likes ?? "?"}</span>
          </span>
          <span style={{ display: "block", color: popoverFg }}>{fragment.text}</span>
          <span style={{ display: "block", marginTop: 6, fontFamily: tokens.font.mono, fontSize: 9.5, color: popoverMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
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
                ? { top: "100%", borderTop: `6px solid ${popoverBg}` }
                : { bottom: "100%", borderBottom: `6px solid ${popoverBg}` })
            }}
          />
        </span>,
        document.body
      )
    : null;

  return (
    <span
      ref={chipRef}
      data-evidence-ref-chip={refId}
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

export function EvidenceProse({
  prose,
  fragmentLookup,
  pinnedRef,
  onPin,
  chipVariant = "atlas"
}: {
  prose: string;
  fragmentLookup: Map<string, EvidenceFragmentLookup>;
  pinnedRef: string | null;
  onPin: (ref: string) => void;
  chipVariant?: "drawer" | "atlas";
}) {
  return (
    <>
      {tokenizeEvidenceProse(prose).map((token, index): ReactNode => {
        if (token.kind === "text") {
          return <span key={`t-${index}`}>{token.value}</span>;
        }
        return (
          <EvidenceRefChip
            key={`c-${index}-${token.value}`}
            refId={token.value}
            fragment={fragmentLookup.get(token.value)}
            pinned={pinnedRef === token.value}
            onPin={onPin}
            variant={chipVariant}
          />
        );
      })}
    </>
  );
}
