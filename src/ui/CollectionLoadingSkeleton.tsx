import { tokens } from "./tokens";

/** Loading occupies the same source/text/status tracks as the real saved-post cards. */
export function CollectionLoadingSkeleton() {
  const p = tokens.panel;
  const geometry = p.list.card;
  const lineHeights = [geometry.metaLine, geometry.titleLine, geometry.summaryLine];
  return <div data-collection-loading="" style={{ display: "grid", gap: p.space.sm }}>
    <span role="status" style={p.visuallyHidden}>載入緊收藏…</span>
    {Array.from({ length: p.list.skeletonCount }, (_, index) => <div key={index} data-collection-loading-card="" aria-hidden="true" style={{ display: "grid", gridTemplateColumns: `${p.size.thumb}px minmax(0,1fr)`, alignItems: "start", gap: geometry.columnGap,
      padding: geometry.padding, boxSizing: "border-box", background: p.surface, borderRadius: p.radius.md, boxShadow: p.shadow.card, minWidth: 0 }}>
      <span style={{ display: "block", width: p.size.thumb, height: p.size.thumb, borderRadius: p.radius.sm, background: p.surfaceSubtle }} />
      <div style={{ display: "grid", gap: geometry.contentGap, minWidth: 0 }}>
        {p.list.skeletonWidths.map((width, row) => <div key={row} style={{ height: lineHeights[row], display: "flex", alignItems: "center" }}><span data-panel-skeleton="" style={{ display: "block", width, height: p.list.skeletonHeights[row], borderRadius: p.radius.xs, background: p.surfaceSubtle }} /></div>)}
        <span style={{ display: "block", height: geometry.statusLine }} />
      </div>
    </div>)}
  </div>;
}
