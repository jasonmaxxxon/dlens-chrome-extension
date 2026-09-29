import type { ReactNode } from "react";
import { tokens, textStyles } from "./tokens";
import { BUILD_VERSION } from "./version";

export type CollectionTab = "collection" | "workspaces";

/** One stable reading surface; domain tools live inside their workspace. */
export function CollectionWorkspaceShell({ tab, onTabChange, onSettings, diagnostics, children, busy = false, allowCollection = true }: {
  tab: CollectionTab;
  onTabChange: (tab: CollectionTab) => void;
  onSettings: () => void;
  diagnostics?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  allowCollection?: boolean;
}) {
  return (
    <div data-collection-workspace-shell="true" style={{ minWidth: 0, display: "grid", gap: tokens.spacing.lg }}>
      <header style={{ position: "sticky", top: 0, zIndex: 3, background: tokens.color.surface, display: "flex", alignItems: "center", gap: tokens.spacing.lg, flexWrap: "wrap", padding: `${tokens.spacing.md}px 0`, borderBottom: `1px solid ${tokens.color.line}` }}>
        <span style={{ fontFamily: tokens.font.serif, fontSize: textStyles.h3.fontSize, color: tokens.color.ink }}>dlens</span>
        <nav aria-label="主要導覽" role="tablist" style={{ display: "flex", gap: tokens.spacing.md, flex: 1 }}>
          {([['collection', '收藏'], ['workspaces', '工作區']] as const).filter(([key]) => allowCollection || key !== 'collection').map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={busy} onClick={() => onTabChange(key)}
              style={{ ...textStyles.bodyTight, fontWeight: tab === key ? 700 : 400, color: tab === key ? tokens.color.accent : tokens.color.softInk, background: "transparent", border: 0, borderBottom: `2px solid ${tab === key ? tokens.color.accent : 'transparent'}`, padding: `${tokens.spacing.sm}px 0`, cursor: "pointer" }}>{label}</button>
          ))}
        </nav>
        <details data-collection-menu="true" style={{ position: "relative" }}>
          <summary aria-label="更多選項" style={{ cursor: "pointer", listStyle: "none", padding: tokens.spacing.sm, color: tokens.color.subInk }}>•••</summary>
          <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 2, width: tokens.layout.collectionMenuWidth, maxWidth: "70vw", display: "grid", gap: tokens.spacing.sm, padding: tokens.spacing.md, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.card, background: tokens.color.surface, boxShadow: tokens.shadow.card }}>
            <button type="button" onClick={onSettings} style={{ ...textStyles.bodyTight, textAlign: "left", border: 0, background: "transparent", padding: tokens.spacing.sm, color: tokens.color.ink, cursor: "pointer" }}>設定</button>
            <details>
              <summary style={{ ...textStyles.caption, cursor: "pointer" }}>連線與處理狀態</summary>
              <div style={{ display: "grid", gap: tokens.spacing.sm, paddingTop: tokens.spacing.sm }}>{diagnostics}</div>
            </details>
            <span style={textStyles.caption}>v.{BUILD_VERSION}</span>
          </div>
        </details>
      </header>
      <main style={{ minWidth: 0 }}>{children}</main>
    </div>
  );
}
