import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { tokens, textStyles } from "./tokens";
import { BUILD_VERSION } from "./version";

export type CollectionTab = "collection" | "workspaces";

/** One stable reading surface; domain tools live inside their workspace. */
export function CollectionWorkspaceShell({ tab, onTabChange, onSettings, inView, onInView, diagnostics, children, busy = false, allowCollection = true }: {
  inView?:{author:string;summary:string} | null;
  onInView?:()=>void;
  tab: CollectionTab;
  onTabChange: (tab: CollectionTab) => void;
  onSettings: () => void;
  diagnostics?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  allowCollection?: boolean;
}) {
  return (
    <div data-collection-workspace-shell="true" style={{ minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 0 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 3, background: tokens.collection.header, backdropFilter: tokens.collection.headerBlur, WebkitBackdropFilter: tokens.collection.headerBlur, height: tokens.collection.headerHeight, boxSizing: "border-box", display: "flex", alignItems: "center", gap: tokens.collection.tabGap, margin: `0 -${tokens.spacing.section}px`, padding: `0 ${tokens.spacing.section}px`, borderBottom: `1px solid ${tokens.color.line}` }}>
        <nav aria-label="主要導覽" role="tablist" style={{ position: "relative", display: "flex", gap: tokens.collection.tabGap, height: "100%", flex: 1 }}>
          {([['collection', '收藏'], ['workspaces', '工作區']] as const).filter(([key]) => allowCollection || key !== 'collection').map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={busy} onClick={() => onTabChange(key)}
              style={{ ...textStyles.bodyTight, fontSize: tokens.collection.bodySize, width: tokens.collection.tabWidth, fontWeight: tab === key ? 600 : 500, color: tab === key ? tokens.color.accent : tokens.color.softInk, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>{label}</button>
          ))}
          <span data-collection-tab-indicator="" aria-hidden="true" style={{ position: "absolute", bottom: 0, left: 0, width: tokens.collection.tabWidth, height: tokens.collection.indicatorHeight, background: tokens.color.accent, borderRadius: tokens.radius.xs, transform: `translateX(${allowCollection && tab === "workspaces" ? tokens.collection.tabWidth + tokens.collection.tabGap : 0}px)` }} />
        </nav>
        <details data-collection-menu="true" style={{ position: "relative" }}>
          <summary aria-label="更多選項" style={{ cursor: "pointer", listStyle: "none", padding: tokens.spacing.sm, color: tokens.color.subInk }}><MoreHorizontal size={tokens.spacing.section} aria-hidden="true" /></summary>
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
      {inView ? <div data-collection-in-view="" style={{minWidth:0,position:'sticky',top:tokens.collection.headerHeight,zIndex:2,display:'flex',alignItems:'center',gap:tokens.spacing.sm,margin:`0 -${tokens.spacing.section}px ${tokens.spacing.sm}px`,padding:`${tokens.spacing.sm}px ${tokens.spacing.section}px`,background:tokens.collection.inViewBar,backdropFilter:tokens.collection.headerBlur,WebkitBackdropFilter:tokens.collection.headerBlur,borderBottom:`1px solid ${tokens.collection.inViewBarEdge}`,fontSize:tokens.reader.secondary}}><span style={{minWidth:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>畫面上：@{inView.author.replace(/^@/,'')} · {inView.summary}</span><button type="button" onClick={onInView} style={{marginLeft:'auto',flexShrink:0,border:0,background:'transparent',color:tokens.color.accent,cursor:'pointer',fontSize:tokens.reader.secondary}}>睇 ›</button></div> : null}
      <main style={{ minWidth: 0, paddingTop:tokens.spacing.lg }}>{children}</main>
    </div>
  );
}
