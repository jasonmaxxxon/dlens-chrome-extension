import type { BackendReachability } from "../state/processing-state";
import { tokens } from "./tokens";

/** A connection label never exposes credentials, paths or query parameters. */
export function backendHost(ingestBaseUrl?: string | null): string | null {
  if (!ingestBaseUrl?.trim()) return null;
  try {
    const url = new URL(ingestBaseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.host : null;
  } catch {
    return null;
  }
}

/** Shared by the menu and connection settings; all inputs are already loaded. */
export function ConnectionHealth({ backendReachability = "reachable", ingestBaseUrl }: {
  backendReachability?: BackendReachability;
  ingestBaseUrl?: string | null;
}) {
  const p = tokens.panel;
  const host = backendHost(ingestBaseUrl);
  const label = backendReachability === "unreachable" ? "連唔到後端" : backendReachability === "slow" ? "後端回應慢" : "後端已連線";
  const tone = backendReachability === "unreachable" ? "danger" : backendReachability === "slow" ? "warning" : "success";
  return <div data-connection-health={backendReachability} style={{ display: "flex", alignItems: "center", gap: p.space.sm, minWidth: 0, fontFamily: tokens.font.sans, fontVariantNumeric: "tabular-nums" }}>
    <span data-status-dot={tone} aria-hidden="true" style={{ width: p.size.statusDot, height: p.size.statusDot, flex: "none", borderRadius: p.radius.pill, background: p[tone] }} />
    <span style={{ ...p.type.bodySm, color: p.ink, flex: "none", whiteSpace: "nowrap" }}>{label}</span>
    {host ? <span data-connection-host="" title={host} style={{ ...p.type.meta, color: p.ink3, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginLeft: "auto" }}>{host}</span> : null}
  </div>;
}
