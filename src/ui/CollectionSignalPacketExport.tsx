import { useState, type CSSProperties } from "react";
import type { SessionRecord } from "../state/types";
import { useCollectionSignalPacketExport, type CollectionPacketExporter, type CollectionPacketFormat } from "./useCollectionSignalPacketExport";
import { tokens } from "./tokens";

// The row's selects match the collection search field instead of the browser's default control.
const panel = tokens.panel;
const select: CSSProperties = { ...panel.type.micro, fontFamily: tokens.font.sans, minWidth: 0, maxWidth: "100%", height: panel.size.buttonSm,
  border: `1px solid ${panel.border}`, borderRadius: panel.radius.sm, background: panel.surface, color: panel.ink2,
  padding: `0 ${panel.space.sm}px`, cursor: "pointer" };

/** One quiet collection action; export orchestration and download stay in the hook. */
export function CollectionSignalPacketExport({ sessions, onExport, defaultSessionId }: { sessions: SessionRecord[]; onExport: CollectionPacketExporter; defaultSessionId?: string }) {
  const folders = sessions.filter(session => session.mode === "product");
  const [selectedId, setSelectedId] = useState("");
  const sessionId = folders.some(folder => folder.id === selectedId) ? selectedId : folders.find(folder => folder.id === defaultSessionId)?.id ?? folders[0]?.id ?? "";
  const state = useCollectionSignalPacketExport(sessionId, onExport);
  const disabled = state.status === "exporting";
  return (
    <div data-collection-signal-packet-export="true" style={{ ...panel.type.micro, display: "flex", alignItems: "center", flexWrap: "wrap", minHeight: panel.size.input, gap: panel.space.sm, padding: `${panel.space.xs}px 0`, color: panel.ink3 }}>
      {folders.length > 1 ? <select aria-label="Signal Packet 工作區" style={{ ...select, flex: "1 1 0", maxWidth: "40%" }} value={sessionId} disabled={disabled} onChange={event => setSelectedId(event.currentTarget.value)}>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select> : null}
      <select aria-label="Signal Packet 格式" style={select} value={state.format} disabled={disabled} onChange={event => state.setFormat(event.currentTarget.value as CollectionPacketFormat)}>
        <option value="html">HTML（俾人睇）</option><option value="jsonl">JSONL（俾 agent）</option>
      </select>
      <button type="button" disabled={disabled || !sessionId} onClick={() => void state.run()} aria-label="匯出俾 agent（Signal Packet）" style={{ ...panel.type.meta, fontFamily: tokens.font.sans, minHeight: panel.size.buttonSm, marginLeft: "auto", border: 0, borderRadius: panel.radius.sm, background: panel.surfaceSubtle, color: panel.accentInk, cursor: "pointer", padding: `0 ${panel.space.sm}px` }}>匯出</button>
      <span role="status" aria-live="polite" data-signal-packet-export-status={state.status} style={{ flexBasis: state.message ? "100%" : undefined }}>{state.message}</span>
    </div>
  );
}
