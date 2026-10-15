import { useState, type CSSProperties } from "react";
import type { SessionRecord } from "../state/types";
import { useCollectionSignalPacketExport, type CollectionPacketExporter, type CollectionPacketFormat } from "./useCollectionSignalPacketExport";
import { textStyles, tokens } from "./tokens";

// The row's selects match the collection search field instead of the browser's default control.
const select: CSSProperties = { ...textStyles.meta, appearance: "none", border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.pill, background: tokens.color.surface, color: tokens.color.subInk, padding: `${tokens.spacing.xs}px ${tokens.spacing.md}px`, cursor: "pointer" };

/** One quiet collection action; export orchestration and download stay in the hook. */
export function CollectionSignalPacketExport({ sessions, onExport, defaultSessionId }: { sessions: SessionRecord[]; onExport: CollectionPacketExporter; defaultSessionId?: string }) {
  const folders = sessions.filter(session => session.mode === "product");
  const [selectedId, setSelectedId] = useState("");
  const sessionId = folders.some(folder => folder.id === selectedId) ? selectedId : folders.find(folder => folder.id === defaultSessionId)?.id ?? folders[0]?.id ?? "";
  const state = useCollectionSignalPacketExport(sessionId, onExport);
  const disabled = state.status === "exporting";
  return (
    <div data-collection-signal-packet-export="true" style={{ ...textStyles.meta, display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacing.sm, padding: tokens.spacing.sm, color: tokens.color.subInk }}>
      {folders.length > 1 ? <select aria-label="Signal Packet 工作區" style={select} value={sessionId} disabled={disabled} onChange={event => setSelectedId(event.currentTarget.value)}>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select> : null}
      <select aria-label="Signal Packet 格式" style={select} value={state.format} disabled={disabled} onChange={event => state.setFormat(event.currentTarget.value as CollectionPacketFormat)}>
        <option value="html">HTML（俾人睇）</option><option value="jsonl">JSONL（俾 agent）</option>
      </select>
      <button type="button" disabled={disabled || !sessionId} onClick={() => void state.run()} style={{ ...textStyles.meta, border: 0, background: "transparent", color: tokens.color.accent, cursor: "pointer", padding: tokens.spacing.sm }}>匯出俾 agent（Signal Packet）</button>
      <span role="status" aria-live="polite" data-signal-packet-export-status={state.status}>{state.message}</span>
    </div>
  );
}
