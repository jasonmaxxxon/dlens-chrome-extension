import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, MoreHorizontal, Settings } from "lucide-react";
import type { BackendReachability, BackendWorkUiState } from "../state/processing-state";
import type { CollectionPost, CollectionRowStatus } from "../viewmodel/collection-browser";
import { CollectionThumbnail } from "./CollectionBrowser";
import { CollectionStatusChip } from "./CollectionStatusChip";
import { ConnectionHealth } from "./ConnectionHealth";
import { collectionTileTint, tokens } from "./tokens";
import { BUILD_VERSION } from "./version";

export type CollectionTab = "collection" | "workspaces";
const p = tokens.panel;
const tabWidth = p.space.xxl * 2;

/** One stable reading surface; domain tools live inside their workspace. */
export function CollectionWorkspaceShell({ tab, onTabChange, onSettings, inView, onInView, diagnostics, children, busy = false, allowCollection = true, backendReachability = "reachable", backendWorkUiState, ingestBaseUrl }: {
  inView?: { author: string; summary: string; post?: CollectionPost; rowStatus?: CollectionRowStatus } | null;
  onInView?: () => void;
  tab: CollectionTab;
  onTabChange: (tab: CollectionTab) => void;
  onSettings: () => void;
  diagnostics?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  allowCollection?: boolean;
  backendReachability?: BackendReachability;
  backendWorkUiState?: BackendWorkUiState | null;
  ingestBaseUrl?: string | null;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const healthLabel = backendReachability === "unreachable" ? "連唔到後端" : backendReachability === "slow" ? "後端回應慢" : "後端已連線";
  const workError = backendWorkUiState?.kind === "backend_error" || backendWorkUiState?.kind === "analysis_failed" || backendWorkUiState?.kind === "expired_running";
  const healthColor = backendReachability === "unreachable" || workError ? p.danger : backendReachability === "slow" || backendWorkUiState?.kind === "retry_waiting" ? p.warning : p.success;
  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
    setMenuOpen(false);
    triggerRef.current?.focus();
  };
  return (
    <div data-collection-workspace-shell="true" style={{ minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 0, fontFamily: tokens.font.sans, color: p.ink, fontVariantNumeric: "tabular-nums" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 3, background: p.bg, height: p.size.header, boxSizing: "border-box", display: "flex", alignItems: "center", gap: p.space.lg, margin: `0 -${p.space.lg}px`, padding: `0 ${p.space.lg}px`, borderBottom: `1px solid ${p.border}` }}>
        <nav aria-label="主要導覽" role="tablist" style={{ position: "relative", display: "flex", gap: p.space.lg, height: "100%", flex: 1, minWidth: 0 }}>
          {([['collection', '收藏'], ['workspaces', '工作區']] as const).filter(([key]) => allowCollection || key !== 'collection').map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={busy} onClick={() => onTabChange(key)}
              style={{ ...p.type.cardTitle, fontFamily: tokens.font.sans, width: tabWidth, flex: "none", whiteSpace: "nowrap", fontWeight: tab === key ? 600 : 500, color: tab === key ? p.ink : p.ink3, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>{label}</button>
          ))}
          <span data-collection-tab-indicator="" aria-hidden="true" style={{ position: "absolute", bottom: 0, left: 0, width: tabWidth, height: p.space.xxs, background: p.accent, borderRadius: p.radius.xs, transform: `translateX(${allowCollection && tab === "workspaces" ? tabWidth + p.space.lg : 0}px)` }} />
        </nav>
        <details ref={menuRef} data-collection-menu="true" onToggle={event => setMenuOpen(event.currentTarget.open)} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); } }} style={{ position: "relative", flex: "none" }}>
          <summary ref={triggerRef} aria-label={`更多選項 · ${healthLabel}`} aria-expanded={menuOpen} style={{ cursor: "pointer", listStyle: "none", width: p.size.button, height: p.size.button, display: "flex", alignItems: "center", justifyContent: "center", gap: p.space.xs, borderRadius: p.radius.sm, color: p.ink2 }}><span data-collection-health-dot="" aria-hidden="true" style={{ width: p.size.statusDot, height: p.size.statusDot, borderRadius: p.radius.pill, background: healthColor, flex: "none" }} /><MoreHorizontal size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /></summary>
          <div data-collection-popover="" style={{ position: "absolute", top: "100%", right: 0, zIndex: 2, width: p.size.menu, maxWidth: `calc(100vw - ${p.space.lg * 2}px)`, boxSizing: "border-box", display: "grid", gap: p.space.sm, padding: p.space.sm, borderRadius: p.radius.md, background: p.surface, boxShadow: p.shadow.popover }}>
            <span style={{ ...p.type.micro, color: p.ink3, padding: `${p.space.xs}px ${p.space.sm}px 0` }}>連線</span>
            {diagnostics ?? <ConnectionHealth backendReachability={backendReachability} ingestBaseUrl={ingestBaseUrl} />}
            <div role="separator" style={{ borderTop: `1px solid ${p.border}` }} />
            <button type="button" data-collection-menu-row="settings" onClick={() => { closeMenu(); onSettings(); }} style={{ ...p.type.bodySm, fontFamily: tokens.font.sans, display: "flex", alignItems: "center", gap: p.space.sm, textAlign: "left", border: 0, borderRadius: p.radius.sm, background: "transparent", height: p.size.input, padding: `0 ${p.space.sm}px`, color: p.ink, cursor: "pointer" }}><Settings size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" /><span>設定</span><ChevronRight size={p.size.icon} strokeWidth={p.iconStrokeWidth} aria-hidden="true" style={{ marginLeft: "auto" }} /></button>
            <div role="separator" style={{ borderTop: `1px solid ${p.border}` }} />
            <span style={{ ...p.type.micro, color: p.ink3, padding: `0 ${p.space.sm}px ${p.space.xs}px` }}>DLens {BUILD_VERSION}</span>
          </div>
        </details>
      </header>
      {inView ? <div data-collection-in-view="" style={{ minWidth: 0, position: "sticky", top: p.size.header, zIndex: 2, height: p.size.banner, boxSizing: "border-box", display: "flex", alignItems: "center", gap: p.space.md, margin: `0 -${p.space.lg}px`, padding: `0 ${p.space.lg}px`, background: p.surface, borderBottom: `1px solid ${p.border}` }}>
        {inView.post ? <CollectionThumbnail post={inView.post} /> : <span data-collection-thumbnail="" aria-hidden="true" style={{ ...collectionTileTint(inView.author), width: p.size.thumb, height: p.size.thumb, borderRadius: p.radius.sm, display: "grid", placeItems: "center", flex: "none", ...p.type.cardTitle }}>{[...inView.author.replace(/^@/, "")][0]?.toUpperCase() || "？"}</span>}
        <span style={{ display: "grid", gap: p.space.xxs, minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "baseline", minWidth: 0 }}><span style={{ ...p.type.micro, color: p.ink3, flex: "none", whiteSpace: "pre" }}>畫面上 · </span><span style={{ ...p.type.meta, color: p.ink2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>@{inView.author.replace(/^@/, '')}</span></span>
          <span style={{ display: "flex", gap: p.space.xs, minWidth: 0, alignItems: "center" }}><span style={{ ...p.type.bodySm, color: p.ink, flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{inView.summary}</span>{inView.rowStatus?.chip ? <CollectionStatusChip chip={inView.rowStatus.chip} /> : null}</span>
        </span>
        <button type="button" onClick={onInView} style={{ ...p.type.meta, fontFamily: tokens.font.sans, height: p.size.buttonSm, padding: `0 ${p.space.sm}px`, flex: "none", border: 0, borderRadius: p.radius.sm, background: p.surfaceSubtle, color: p.accentInk, cursor: "pointer" }}>打開</button>
      </div> : null}
      <main style={{ minWidth: 0, paddingTop: p.space.lg }}>{children}</main>
    </div>
  );
}
