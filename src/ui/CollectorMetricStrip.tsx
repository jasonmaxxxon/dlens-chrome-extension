import type { TargetDescriptor } from "../contracts/target-descriptor";
import { MetricIcon, lineClamp } from "./components";
import { tokens } from "./tokens";

const panel = tokens.panel;

type CollectorMetricKey = "likes" | "comments" | "reposts" | "forwards";

const COLLECTOR_METRIC_KEYS: readonly CollectorMetricKey[] = ["likes", "comments", "reposts", "forwards"];

export const COLLECTOR_MOTION_CSS = `
  [data-collector-processing-fill="true"] {
    animation: ${tokens.motion.keyframes.indeterminate};
  }

  [data-collector-success-dot="true"] {
    animation: ${tokens.motion.keyframes.successPop};
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
        gap: panel.space.xs,
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
              gap: panel.space.xs,
              minHeight: 20,
              padding: `${panel.space.xs}px ${panel.space.sm}px`,
              borderRadius: panel.radius.pill,
              border: `1px solid ${present ? panel.border : panel.border}`,
              background: present ? panel.surfaceSubtle : panel.surfaceSubtle,
              color: present ? panel.ink2 : panel.ink3,
              fontFamily: tokens.font.sans,
              fontSize: panel.type.micro.fontSize,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              lineHeight: panel.type.micro.lineHeight
            }}
          >
            <MetricIcon kind={key} size={panel.size.chipIcon} />
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
        color: panel.ink2,
        fontSize: panel.type.meta.fontSize, fontWeight: panel.type.meta.fontWeight,
        lineHeight: panel.type.meta.lineHeight,
        ...lineClamp(lines)
      }}
    >
      {children}
    </span>
  );
}
