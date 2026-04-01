import { useEffect, useMemo, useState } from "react";
import type { ExtensionResponse } from "../state/messages";
import { getActiveItem, getActiveSession, sendExtensionMessage, useExtensionSnapshot } from "./controller";

function statusColor(status: string) {
  switch (status) {
    case "queued":
      return "#b54708";
    case "running":
      return "#175cd3";
    case "succeeded":
      return "#027a48";
    case "failed":
      return "#b42318";
    default:
      return "#667085";
  }
}

export function SidepanelApp() {
  const { snapshot } = useExtensionSnapshot();
  const activeSession = useMemo(() => getActiveSession(snapshot), [snapshot]);
  const activeItem = useMemo(() => getActiveItem(snapshot), [snapshot]);
  const [ingestBaseUrl, setIngestBaseUrl] = useState("http://127.0.0.1:8000");
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    if (snapshot?.global.settings.ingestBaseUrl) {
      setIngestBaseUrl(snapshot.global.settings.ingestBaseUrl);
    }
  }, [snapshot?.global.settings.ingestBaseUrl]);

  const sessions = snapshot?.global.sessions || [];

  async function onSaveBaseUrl() {
    const response = await sendExtensionMessage<ExtensionResponse>({
      type: "settings/set-ingest-base-url",
      value: ingestBaseUrl
    });
    if (!response.ok) {
      console.error(response.error);
    }
  }

  async function onCreateSession() {
    if (!newFolderName.trim()) {
      return;
    }
    const response = await sendExtensionMessage<ExtensionResponse>({
      type: "session/create",
      name: newFolderName.trim()
    });
    if (response.ok) {
      setNewFolderName("");
    }
  }

  async function onSelectOnPage() {
    await sendExtensionMessage<ExtensionResponse>({ type: "selection/start-active-tab" });
  }

  async function onSavePreview() {
    await sendExtensionMessage<ExtensionResponse>({ type: "session/save-current-preview" });
  }

  async function onQueueSelected() {
    await sendExtensionMessage<ExtensionResponse>({ type: "session/queue-selected" });
  }

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 16, color: "#101828" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>DLens v0 Debug Panel</h1>

      <section style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>Ingest base URL</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={ingestBaseUrl}
            onChange={(event) => setIngestBaseUrl(event.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #d0d5dd" }}
          />
          <button onClick={onSaveBaseUrl} style={{ padding: "8px 12px" }}>
            Save
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="New folder name"
            style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #d0d5dd" }}
          />
          <button onClick={onCreateSession} style={{ padding: "8px 12px" }}>
            Create folder
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <button onClick={onSelectOnPage} style={{ width: "100%", padding: "10px 12px", marginBottom: 8 }}>
          Select on page
        </button>
        <button
          onClick={onSavePreview}
          disabled={!snapshot?.tab.currentPreview}
          style={{ width: "100%", padding: "10px 12px", marginBottom: 8 }}
        >
          Save current preview to folder
        </button>
        <button
          onClick={onQueueSelected}
          disabled={!activeItem}
          style={{ width: "100%", padding: "10px 12px" }}
        >
          Queue selected item
        </button>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Current preview</h2>
        {snapshot?.tab.currentPreview ? (
          <div style={{ border: "1px solid #e4e7ec", borderRadius: 12, padding: 12 }}>
            <div><strong>author:</strong> {snapshot.tab.currentPreview.author_hint || "-"}</div>
            <div><strong>post_url:</strong> {snapshot.tab.currentPreview.post_url || "-"}</div>
            <div><strong>text:</strong> {snapshot.tab.currentPreview.text_snippet || "-"}</div>
          </div>
        ) : (
          <div style={{ color: "#667085" }}>No current preview.</div>
        )}
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Folders</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {sessions.length ? (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() =>
                  sendExtensionMessage<ExtensionResponse>({
                    type: "session/set-active",
                    sessionId: session.id
                  })
                }
                style={{
                  border: session.id === snapshot?.global.activeSessionId ? "2px solid #175cd3" : "1px solid #d0d5dd",
                  background: "#fff",
                  borderRadius: 12,
                  textAlign: "left",
                  padding: 10
                }}
              >
                <strong>{session.name}</strong>
                <div style={{ color: "#667085", fontSize: 12 }}>{session.items.length} saved posts</div>
              </button>
            ))
          ) : (
            <div style={{ color: "#667085" }}>No folders yet.</div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Active folder</h2>
        {activeSession ? (
          <div style={{ display: "grid", gap: 8 }}>
            {activeSession.items.map((item, index) => (
              <button
                key={item.id}
                onClick={() =>
                  sendExtensionMessage<ExtensionResponse>({
                    type: "session/select-item",
                    sessionId: activeSession.id,
                    itemId: item.id
                  })
                }
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 12,
                  border: item.id === snapshot?.tab.activeItemId ? "2px solid #175cd3" : "1px solid #d0d5dd",
                  background: "#fff"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>#{index + 1} {item.descriptor.author_hint || "Unknown"}</strong>
                  <span style={{ color: statusColor(item.status), fontSize: 12 }}>{item.status}</span>
                </div>
                <div style={{ color: "#475467", fontSize: 12, marginTop: 4 }}>{item.descriptor.text_snippet || "-"}</div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: "#667085" }}>No active folder.</div>
        )}
      </section>

      {activeItem ? (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>Selected item</h2>
          <div style={{ border: "1px solid #e4e7ec", borderRadius: 12, padding: 12 }}>
            <div><strong>status:</strong> <span style={{ color: statusColor(activeItem.status) }}>{activeItem.status}</span></div>
            <div><strong>job:</strong> {activeItem.jobId || "-"}</div>
            <div><strong>capture:</strong> {activeItem.captureId || "-"}</div>
            <div><strong>errors:</strong> {activeItem.lastError || "-"}</div>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => sendExtensionMessage<ExtensionResponse>({ type: "session/refresh-selected" })}
                style={{ padding: "8px 12px" }}
              >
                Refresh selected
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {snapshot?.tab.error ? (
        <section style={{ color: "#b42318", fontSize: 12 }}>
          <strong>Error:</strong> {snapshot.tab.error}
        </section>
      ) : null}
    </div>
  );
}
