import { useState } from "react";

import type { TargetDescriptor } from "../contracts/target-descriptor";
import { MetricIcon } from "./components";
import { textStyles, tokens } from "./tokens";

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
    borderRadius: tokens.radius.xs,
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
      style={{ ...style, objectFit: "cover", background: tokens.color.inkWash }}
    />
  ) : <span data-saved-post-thumbnail="fallback" aria-hidden="true" style={style} />;
}

const METRIC_LABELS = { likes: "讚", comments: "回覆", reposts: "轉發", forwards: "分享" } as const;

export function SavedPostMetrics({ descriptor }: { descriptor?: TargetDescriptor }) {
  return (
    <span aria-label="貼文互動" role="group" style={{ display: "flex", gap: tokens.spacing.sm, flexWrap: "wrap", minWidth: 0 }}>
      {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map((key) => {
        const count = descriptor?.engagement[key];
        const present = descriptor?.engagement_present[key] === true && typeof count === "number" && Number.isFinite(count);
        const value = present ? String(count) : "未讀";
        const label = `${METRIC_LABELS[key]} ${value}`;
        return (
          <span key={key} data-saved-signal-metric={key} aria-label={label} title={label} style={{ ...textStyles.caption, display: "inline-flex", alignItems: "center", gap: tokens.spacing.xs, color: tokens.color.softInk }}>
            <span aria-hidden="true"><MetricIcon kind={key} size={tokens.spacing.md} /></span>
            <span>{value}</span>
          </span>
        );
      })}
    </span>
  );
}
