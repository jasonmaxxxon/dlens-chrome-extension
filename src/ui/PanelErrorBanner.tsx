import type { ReactNode } from "react";
import { tokens } from "./tokens";

/** One readable inline error surface; callers own the reason and recovery action. */
export function PanelErrorBanner({ children }: { children: ReactNode }) {
  const p = tokens.panel;
  return <div role="alert" data-panel-error-banner="" style={{ ...p.type.bodySm, fontFamily: tokens.font.sans, minHeight: p.size.input,
    boxSizing: "border-box", display: "flex", alignItems: "center", padding: p.space.sm,
    borderRadius: p.radius.sm, background: p.dangerSoft, color: p.danger, overflowWrap: "anywhere", minWidth: 0 }}>{children}</div>;
}
