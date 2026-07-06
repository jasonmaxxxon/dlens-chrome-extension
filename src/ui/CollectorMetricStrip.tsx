import type { TargetDescriptor } from "../contracts/target-descriptor";
import { MetricIcon, lineClamp } from "./components";
import { tokens } from "./tokens";

type CollectorMetricKey = "likes" | "comments" | "reposts" | "forwards";

const COLLECTOR_METRIC_KEYS: readonly CollectorMetricKey[] = ["likes", "comments", "reposts", "forwards"];

export const COLLECTOR_MOTION_CSS = `
  [data-collector-processing-fill="true"] {
    animation: ${tokens.motion.keyframes.indeterminate};
  }

  [data-collector-success-dot="true"] {
    animation: ${tokens.motion.keyframes.successPulse};
  }

  @media (prefers-reduced-motion: reduce) {
    [data-collector-processing-fill="true"],
    [data-collector-success-dot="true"] {
      animation: none !important;
      transform: none !important;
    }
  }
`;

export function formatCollectorMetricValue(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "–" : String(value);
}

export function CollectorMetricStrip({
  descriptor,
  marker
}: {
  descriptor: TargetDescriptor;
  marker: string;
}) {
  return (
    <span
      data-collector-metric-strip={marker}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: tokens.spacing.xs,
        minWidth: 0,
        flexWrap: "wrap"
      }}
    >
      {COLLECTOR_METRIC_KEYS.map((key) => {
        const value = descriptor.engagement[key];
        const present = descriptor.engagement_present[key] || value != null;
        return (
          <span
            key={key}
            data-collector-metric={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: tokens.spacing.xs,
              minHeight: 20,
              padding: `${tokens.spacing.xs - 1}px ${tokens.spacing.sm}px`,
              borderRadius: tokens.radius.pill,
              border: `1px solid ${present ? tokens.color.cardEdge : tokens.color.glassBorder}`,
              background: present ? tokens.color.neutralSurfaceSoft : tokens.color.contextSurface,
              color: present ? tokens.color.subInk : tokens.color.softInk,
              fontFamily: tokens.font.mono,
              fontSize: 10,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1
            }}
          >
            <MetricIcon kind={key} size={12} />
            <span>{formatCollectorMetricValue(value)}</span>
          </span>
        );
      })}
    </span>
  );
}

export function CollectorGist({ children, lines = 2 }: { children: string; lines?: number }) {
  return (
    <span
      style={{
        minWidth: 0,
        color: tokens.color.subInk,
        fontSize: 12,
        lineHeight: 1.55,
        ...lineClamp(lines)
      }}
    >
      {children}
    </span>
  );
}
