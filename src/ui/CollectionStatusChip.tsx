import type { CollectionRowStatus } from "../viewmodel/collection-browser";
import { tokens } from "./tokens";

const panel = tokens.panel;
const tones = {
  neutral: { background: panel.surfaceSubtle, color: panel.ink3 },
  success: { background: panel.successSoft, color: panel.success },
  warning: { background: panel.warningSoft, color: panel.warning },
  running: { background: panel.accentSoft, color: panel.accentInk },
  danger: { background: panel.dangerSoft, color: panel.danger },
  accent: { background: panel.accentSoft, color: panel.accentInk }
} as const;

/** A single presentation map shared by the saved-post card and in-view banner. */
export function CollectionStatusChip({ chip }: { chip: CollectionRowStatus["chip"] }) {
  return chip ? <span data-collection-status-chip={chip.tone} style={{ ...panel.type.micro, ...tones[chip.tone],
    display: "inline-flex", flex: "none", alignItems: "center", minWidth: 0, maxWidth: "100%", borderRadius: panel.radius.xs,
    padding: `${panel.space.xxs}px ${panel.space.xs}px`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{chip.label}</span> : null;
}
