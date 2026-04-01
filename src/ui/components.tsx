import type { CSSProperties, ReactNode } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type { WorkerStatus } from "../state/processing-state.ts";
import { TOKENS, tokens } from "./tokens";

export { TOKENS } from "./tokens";

export function IconButton({
  children,
  onClick,
  label,
  disabled
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        borderRadius: tokens.radius.pill,
        border: `1px solid ${tokens.color.glassBorder}`,
        background: tokens.color.glassBg,
        backdropFilter: tokens.effect.glassBlur,
        WebkitBackdropFilter: tokens.effect.glassBlur,
        color: tokens.color.ink,
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: tokens.motion.transition
      }}
    >
      {children}
    </button>
  );
}

export function statusTheme(status: string) {
  switch (status) {
    case "saved":
      return { background: tokens.color.neutralSurface, color: tokens.color.neutralText };
    case "queued":
      return { background: TOKENS.queuedSoft, color: TOKENS.queued };
    case "running":
      return { background: TOKENS.runningSoft, color: TOKENS.running };
    case "succeeded":
      return { background: TOKENS.successSoft, color: TOKENS.success };
    case "failed":
      return { background: TOKENS.failedSoft, color: TOKENS.failed };
    default:
      return { background: tokens.color.neutralSurface, color: tokens.color.neutralText };
  }
}

export function MetricIcon({ kind }: { kind: "likes" | "comments" | "reposts" | "forwards" }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  switch (kind) {
    case "likes":
      return (
        <svg {...common}>
          <path d="M12 20.5s-6.5-4.35-8.5-7.05C1.1 10.17 2.18 6.5 5.82 6.5c1.92 0 3.1.95 4.02 2.2C10.76 7.45 11.94 6.5 13.86 6.5 17.5 6.5 18.58 10.17 20.5 13.45 18.5 16.15 12 20.5 12 20.5Z" />
        </svg>
      );
    case "comments":
      return (
        <svg {...common}>
          <path d="M7 17.5h6l4 3v-3h.5A2.5 2.5 0 0 0 20 15V7a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 7v8A2.5 2.5 0 0 0 6.5 17.5H7Z" />
        </svg>
      );
    case "reposts":
      return (
        <svg {...common}>
          <path d="M7 7h10l-2.5-2.5" />
          <path d="M17 17H7l2.5 2.5" />
          <path d="M17 7v4" />
          <path d="M7 17v-4" />
        </svg>
      );
    case "forwards":
      return (
        <svg {...common}>
          <path d="M21 4 10 15" />
          <path d="m21 4-7 16-4-5-5-4 16-7Z" />
        </svg>
      );
  }
}

export function MetricChip({
  kind,
  value,
  present
}: {
  kind: "likes" | "comments" | "reposts" | "forwards";
  value: number | null;
  present: boolean;
}) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: present ? tokens.color.accentSoft : tokens.color.neutralSurface,
        color: present ? tokens.color.accent : tokens.color.softInk,
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        letterSpacing: "0.01em",
        transition: tokens.motion.transition
      }}
    >
      <MetricIcon kind={kind} />
      <span>{value ?? "—"}</span>
    </span>
  );
}

function previewMetrics(descriptor: TargetDescriptor | null | undefined) {
  if (!descriptor) {
    return [];
  }
  return [
    <MetricChip key="likes" kind="likes" value={descriptor.engagement.likes} present={descriptor.engagement_present.likes} />,
    <MetricChip
      key="comments"
      kind="comments"
      value={descriptor.engagement.comments}
      present={descriptor.engagement_present.comments}
    />,
    <MetricChip
      key="reposts"
      kind="reposts"
      value={descriptor.engagement.reposts}
      present={descriptor.engagement_present.reposts}
    />,
    <MetricChip
      key="forwards"
      kind="forwards"
      value={descriptor.engagement.forwards}
      present={descriptor.engagement_present.forwards}
    />
  ];
}

function avatarFromAuthor(author: string | null | undefined) {
  const cleaned = (author || "").trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "D";
}

export function lineClamp(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden"
  };
}

export function surfaceCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    padding: 16,
    borderRadius: tokens.radius.card,
    background: tokens.color.glassBg,
    backdropFilter: tokens.effect.glassBlur,
    WebkitBackdropFilter: tokens.effect.glassBlur,
    border: `1px solid ${tokens.color.glassBorder}`,
    boxShadow: tokens.shadow.glass,
    transition: tokens.motion.transition,
    ...extra
  };
}

export function formatElapsed(isoTime: string | null | undefined): string {
  if (!isoTime) {
    return "just now";
  }
  const diffMs = Date.now() - new Date(isoTime).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "just now";
  }
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function processingTone(workerStatus: WorkerStatus | null, ready: number, total: number) {
  if (total > 0 && ready >= 2 && ready === total) {
    return {
      background: tokens.color.successSoft,
      border: "rgba(5,150,105,0.2)",
      text: tokens.color.success
    };
  }
  if (workerStatus === "draining") {
    return {
      background: tokens.color.runningSoft,
      border: "rgba(37,99,235,0.2)",
      text: tokens.color.running
    };
  }
  return {
    background: tokens.color.idleBg,
    border: tokens.color.idleBorder,
    text: tokens.color.softInk
  };
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        borderRadius: tokens.radius.pill,
        padding: "10px 16px",
        background: disabled ? tokens.color.disabledPrimary : `linear-gradient(135deg, ${tokens.color.accent}, #818cf8)`,
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.01em",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : tokens.shadow.accentButton,
        transition: tokens.motion.transition,
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  style
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${tokens.color.glassBorder}`,
        borderRadius: tokens.radius.pill,
        padding: "10px 16px",
        background: disabled ? tokens.color.disabledSecondary : tokens.color.glassBg,
        backdropFilter: tokens.effect.glassBlur,
        WebkitBackdropFilter: tokens.effect.glassBlur,
        color: tokens.color.ink,
        fontWeight: 600,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: tokens.motion.transition,
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function PageButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: "none",
        borderRadius: tokens.radius.pill,
        padding: "9px 10px",
        background: active ? `linear-gradient(135deg, ${tokens.color.accent}, #818cf8)` : tokens.color.neutralSurfaceSoft,
        color: active ? "#fff" : tokens.color.subInk,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: active ? tokens.shadow.activeTab : "none",
        transition: tokens.motion.transition
      }}
    >
      {children}
    </button>
  );
}

export function PreviewCard({
  descriptor,
  folderName,
  isSaved,
  onPrimary,
  onOpen
}: {
  descriptor: TargetDescriptor | null | undefined;
  folderName: string;
  isSaved: boolean;
  onPrimary: () => void;
  onOpen: () => void;
}) {
  const metrics = previewMetrics(descriptor);

  return (
    <div style={surfaceCardStyle({ display: "grid", gap: 10 })}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${tokens.color.accent}, #818cf8)`,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
            boxShadow: tokens.shadow.previewAvatar
          }}
        >
          {avatarFromAuthor(descriptor?.author_hint)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color: TOKENS.softInk, marginBottom: 2, fontWeight: 500 }}>Current post preview</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{descriptor?.author_hint || "Hover a Threads post"}</div>
            {descriptor ? (
              <span
                style={{
                  background: isSaved ? TOKENS.successSoft : tokens.color.neutralSurfaceSoft,
                  color: isSaved ? TOKENS.success : TOKENS.softInk,
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  border: isSaved ? "1px solid rgba(5,150,105,0.2)" : "1px solid transparent"
                }}
              >
                {isSaved ? "Saved" : "Preview"}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: TOKENS.subInk, lineHeight: 1.55, ...lineClamp(2) }}>
            {descriptor?.text_snippet || "Collect mode will show a compact preview here without turning this into a reading panel."}
          </div>
        </div>
      </div>

      {metrics.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{metrics}</div> : null}

      <div style={{ fontSize: 12, color: TOKENS.softInk }}>
        Folder: <strong style={{ color: TOKENS.ink }}>{folderName}</strong>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <PrimaryButton onClick={onPrimary} disabled={!descriptor || isSaved}>
          Save to folder
        </PrimaryButton>
        <SecondaryButton onClick={onOpen} disabled={!descriptor?.post_url}>
          Open in Threads
        </SecondaryButton>
      </div>
    </div>
  );
}
