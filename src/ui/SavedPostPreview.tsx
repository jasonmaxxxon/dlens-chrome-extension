import { useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import { Heart, MessageCircle, Repeat2, Share2 } from "lucide-react";
import { tokens } from "./tokens";

/** Expired CDN URLs use the same quiet, aligned space as text-only posts. */
export function SavedPostThumbnail({ imageUrl }: { imageUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl.trim())
    ? imageUrl.trim()
    : null;
  const style = {
    display: "block",
    width: tokens.layout.savedPostThumbnailSize,
    height: tokens.layout.savedPostThumbnailSize,
    borderRadius: tokens.panel.radius.sm,
    flexShrink: 0
  } as const;

  return source && source !== failedUrl ? (
    <img
      data-saved-post-thumbnail="image"
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(source)}
      style={{ ...style, objectFit: "cover", background: tokens.panel.surfaceSubtle }}
    />
  ) : <span data-saved-post-thumbnail="fallback" aria-hidden="true" style={style} />;
}

const METRIC_ICONS = { likes: Heart, comments: MessageCircle, reposts: Repeat2, forwards: Share2 } as const;
const METRIC_LABELS = { likes: "讚", comments: "回覆", reposts: "轉發", forwards: "分享" } as const;

export function SavedPostMetrics({ descriptor }: { descriptor?: TargetDescriptor }) {
  return (
    <span aria-label="貼文互動" role="group" style={{ display: "flex", gap: tokens.panel.space.sm, flexWrap: "wrap", minWidth: 0 }}>
      {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map((key) => {
        const Icon = METRIC_ICONS[key];
        const count = descriptor?.engagement[key];
        const present = descriptor?.engagement_present[key] === true && typeof count === "number" && Number.isFinite(count);
        const value = present ? String(count) : "未讀";
        const label = `${METRIC_LABELS[key]} ${value}`;
        return (
          <span key={key} data-saved-signal-metric={key} aria-label={label} title={label} style={{ ...tokens.panel.type.meta, display: "inline-flex", alignItems: "center", gap: tokens.panel.space.xs, color: tokens.panel.ink3, fontVariantNumeric: "tabular-nums" }}>
            <span aria-hidden="true"><Icon size={tokens.panel.size.icon} strokeWidth={tokens.panel.iconStrokeWidth} /></span>
            <span>{value}</span>
          </span>
        );
      })}
    </span>
  );
}
