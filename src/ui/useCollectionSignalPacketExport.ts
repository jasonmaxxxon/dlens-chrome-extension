import { useEffect, useRef, useState } from "react";
import type { ExtensionMessage, ExtensionResponse } from "../state/messages";
import type { SignalPacketExportFormat, SignalPacketExportResult } from "../compare/signal-packet-export";

export type CollectionPacketFormat = Extract<SignalPacketExportFormat, "html" | "jsonl">;
export type CollectionPacketExporter = (options: { sessionId: string; format: CollectionPacketFormat }) => Promise<{ ok: true; exportResult: SignalPacketExportResult } | { ok: false; error: string }>;

export function downloadCollectionPacket(result: SignalPacketExportResult): void {
  const url = URL.createObjectURL(new Blob([result.content], { type: result.mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useCollectionSignalPacketExport(sessionId: string, onExport: CollectionPacketExporter) {
  const [format, setFormat] = useState<CollectionPacketFormat>("html");
  const [status, setStatus] = useState<"idle" | "exporting" | "exported" | "error">("idle");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setStatus("idle"); setMessage("");
    return () => { generation.current++; };
  }, [sessionId]);
  async function run() {
    if (!sessionId || pending.current) return;
    pending.current = true;
    const current = generation.current;
    setStatus("exporting"); setMessage("匯出中…");
    try {
      const response = await onExport({ sessionId, format });
      if (generation.current !== current) return;
      if (!response.ok) throw new Error(response.error);
      downloadCollectionPacket(response.exportResult);
      setStatus("exported");
      setMessage(`${response.exportResult.packetCount} packets · ${response.exportResult.filename}`);
    } catch (error) {
      if (generation.current === current) { setStatus("error"); setMessage(error instanceof Error ? error.message : String(error)); }
    } finally { pending.current = false; }
  }
  return { format, setFormat, status, message, run };
}

/** Existing background export message; no analysis or new storage writes. */
export async function requestCollectionSignalPacketExport(
  send: (message: Extract<ExtensionMessage, { type: "signal-packet/export" }>) => Promise<ExtensionResponse>,
  options: { sessionId: string; format: SignalPacketExportFormat }
): Promise<{ ok: true; exportResult: SignalPacketExportResult } | { ok: false; error: string }> {
  try {
    const response = await send({ type: "signal-packet/export", format: options.format, filter: { sessionId: options.sessionId } });
    if (!response.ok) return { ok: false, error: response.error };
    return response.signalPacketExport ? { ok: true, exportResult: response.signalPacketExport } : { ok: false, error: "沒有產生 Signal Packet 匯出內容。" };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
