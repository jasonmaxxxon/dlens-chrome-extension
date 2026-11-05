import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { DEFAULT_SESSION_NAME_BY_MODE, getSessionDisplayName } from "../state/store-helpers";
import type { FolderMode, SessionRecord } from "../state/types";
import { MoreHorizontal } from "lucide-react";
import { buildWorkspacePanelCards } from "../viewmodel/workspace-panel";
import { CollectionThumbnail } from "./CollectionBrowser";
import { getModeTheme, tokens } from "./tokens";

interface WorkspaceHomeViewProps {
  sessions: SessionRecord[];
  nowMs?: number;
  activeSessionId: string | null;
  onOpen: (sessionId: string) => Promise<unknown> | unknown;
  onCreate: (name: string, mode: FolderMode) => Promise<unknown>;
  onRename?: (sessionId: string, name: string) => Promise<unknown>;
  onDelete?: (sessionId: string) => Promise<unknown>;
  externalError?: string | null;
  busy?: boolean;
  allowedCreationModes?: readonly FolderMode[];
}

const WORKSPACE_NAMES: Record<FolderMode, string> = {
  archive: "收藏整理",
  topic: "觀眾反應",
  product: "個人應用",
  "pr-evidence": "活動追蹤"
};

const CREATION_MODES = ["topic", "product", "pr-evidence"] as const;

const buttonStyle: CSSProperties = {
  ...tokens.panel.type.meta,
  fontFamily: tokens.font.sans,
  minHeight: tokens.panel.size.button,
  flexShrink: 0,
  padding: `0 ${tokens.panel.space.md}px`,
  border: `1px solid ${tokens.panel.border}`,
  borderRadius: tokens.panel.radius.sm,
  background: tokens.panel.surface,
  color: tokens.panel.ink,
  cursor: "pointer"
};

const fieldStyle: CSSProperties = {
  ...tokens.panel.type.bodySm,
  fontFamily: tokens.font.sans,
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  height: tokens.panel.size.input,
  padding: `0 ${tokens.panel.space.md}px`,
  border: `1px solid ${tokens.panel.borderStrong}`,
  borderRadius: tokens.panel.radius.sm,
  background: tokens.panel.surface,
  color: tokens.panel.ink
};

const inlineCardStyle: CSSProperties = { display: "grid", gap: tokens.panel.space.md, padding: tokens.panel.space.md,
  minWidth: 0, borderRadius: tokens.panel.radius.md, background: tokens.panel.surface, boxShadow: tokens.panel.shadow.card };
const labelStyle: CSSProperties = { ...tokens.panel.type.meta, display: "grid", gap: tokens.panel.space.xs, color: tokens.panel.ink2 };

function workspaceName(session: SessionRecord): string {
  const name = getSessionDisplayName(session);
  return name === DEFAULT_SESSION_NAME_BY_MODE[session.mode] ? WORKSPACE_NAMES[session.mode] : name;
}

function failedResponse(response: unknown): boolean {
  return typeof response === "object" && response !== null && "ok" in response && response.ok === false;
}

export function WorkspaceHomeView({ sessions, nowMs = 0, activeSessionId, onOpen, onCreate, onRename, onDelete, externalError, busy = false, allowedCreationModes = CREATION_MODES }: WorkspaceHomeViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<FolderMode>(allowedCreationModes[0] ?? "topic");
  const [management, setManagement] = useState<{ sessionId: string; action: "rename" | "delete" } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const disabled = busy || pending;

  async function openWorkspace(sessionId: string) {
    if (busy || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      if (failedResponse(await onOpen(sessionId))) throw new Error("open-failed");
    } catch {
      setError("未能開啟工作區，請再試一次。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (busy || pendingRef.current || !trimmedName || !allowedCreationModes.includes(mode)) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      if (failedResponse(await onCreate(trimmedName, mode))) throw new Error("create-failed");
      setName("");
      setMode(allowedCreationModes[0] ?? "topic");
      setShowCreate(false);
    } catch {
      setError("未能建立工作區，請再試一次。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function manageWorkspace(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!management || busy || pendingRef.current) return;
    const { sessionId, action } = management;
    if (!sessions.some((session) => session.id === sessionId)) return;
    if (action === "rename" && (!onRename || !renameName.trim())) return;
    if (action === "delete" && !onDelete) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = action === "rename"
        ? await onRename!(sessionId, renameName.trim())
        : await onDelete!(sessionId);
      if (failedResponse(response)) throw new Error("management-failed");
      setManagement(null);
    } catch {
      setError(action === "rename" ? "未能重新命名工作區，請再試一次。" : "未能刪除工作區，請再試一次。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const cards = buildWorkspacePanelCards(sessions, nowMs);
  const visibleError = error ?? externalError;
  const managedSession = sessions.find((session) => session.id === management?.sessionId);

  return (
    <section data-workspace-home="true" aria-busy={pending || undefined} style={{ display: "grid", gap: tokens.panel.space.lg, minWidth: 0, fontFamily: tokens.font.sans }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.panel.space.md }}>
        <span style={{ ...tokens.panel.type.heading, color: tokens.panel.ink }}>工作區</span>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={showCreate}
          onClick={() => { setShowCreate(!showCreate); setManagement(null); setError(null); }}
          style={{ ...buttonStyle, minHeight: tokens.panel.size.buttonSm, background: tokens.panel.surfaceSubtle, color: tokens.panel.accentInk }}
        >＋ 新工作區</button>
      </div>

      {showCreate ? (
        <form onSubmit={(event) => void createWorkspace(event)} style={inlineCardStyle}>
          <label style={labelStyle}>
            名稱
            <input name="workspace-name" value={name} onInput={(event) => setName(event.currentTarget.value)} disabled={disabled} required style={fieldStyle} />
          </label>
          <div style={labelStyle}>
            <span>用途</span>
            <div role="radiogroup" aria-label="工作區用途" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, allowedCreationModes.length)}, minmax(0, 1fr))`, gap: tokens.panel.space.xs, padding: tokens.panel.space.xs, background: tokens.panel.surfaceSunken, borderRadius: tokens.panel.radius.sm }}>
              {allowedCreationModes.map((value) => <label key={value} style={{ ...tokens.panel.type.meta, display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.panel.space.xs, minHeight: tokens.panel.size.button, minWidth: 0, borderRadius: tokens.panel.radius.xs, background: mode === value ? tokens.panel.surface : "transparent", color: mode === value ? tokens.panel.ink : tokens.panel.ink3, cursor: disabled ? "default" : "pointer" }}>
                <input type="radio" name="workspace-type" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={disabled} style={{ margin: 0, accentColor: tokens.panel.accent, flexShrink: 0 }} />
                {WORKSPACE_NAMES[value]}
              </label>)}
            </div>
          </div>
          <div style={{ display: "flex", gap: tokens.panel.space.sm }}>
            <button type="submit" disabled={disabled || !name.trim()} style={buttonStyle}>{pending ? "建立中…" : "建立"}</button>
            <button type="button" disabled={disabled} onClick={() => { setShowCreate(false); setError(null); }} style={buttonStyle}>取消</button>
          </div>
        </form>
      ) : null}

      {management && managedSession ? (
        management.action === "rename" ? (
          <form onSubmit={(event) => void manageWorkspace(event)} style={inlineCardStyle}>
            <label style={labelStyle}>
              重新命名「{workspaceName(managedSession)}」
              <input name="workspace-rename" value={renameName} onInput={(event) => setRenameName(event.currentTarget.value)} disabled={disabled} required style={fieldStyle} />
            </label>
            <div style={{ display: "flex", gap: tokens.panel.space.sm }}>
              <button type="submit" disabled={disabled || !renameName.trim()} style={buttonStyle}>儲存名稱</button>
              <button type="button" disabled={disabled} onClick={() => { setManagement(null); setError(null); }} style={buttonStyle}>取消</button>
            </div>
          </form>
        ) : (
          <div role="alertdialog" aria-label="確認刪除工作區" style={inlineCardStyle}>
            <p style={{ ...tokens.panel.type.bodySm, margin: 0, color: tokens.panel.ink }}>確認刪除「{workspaceName(managedSession)}」及其中收藏？此操作無法復原。</p>
            <div style={{ display: "flex", gap: tokens.panel.space.sm }}>
              <button type="button" disabled={disabled} onClick={() => void manageWorkspace()} style={buttonStyle}>確認刪除</button>
              <button type="button" disabled={disabled} onClick={() => { setManagement(null); setError(null); }} style={buttonStyle}>取消</button>
            </div>
          </div>
        )
      ) : null}

      {visibleError ? <p role="alert" style={{ ...tokens.panel.type.bodySm, color: tokens.panel.danger, background: tokens.panel.dangerSoft, padding: tokens.panel.space.md, borderRadius: tokens.panel.radius.sm, margin: 0 }}>{visibleError}</p> : null}

      {sessions.length ? (
        <div style={{ display: "grid", gap: tokens.panel.space.md, minWidth: 0 }}>
          {cards.map(({ session, purpose, count, readingCount, previews, lastSavedRelative }, index) => (
            <article key={session.id} data-workspace-card="" data-collection-arrival=""
              // The whole card opens the workspace; its name button and ⋯ menu keep their own clicks.
              onClick={(event) => { if (!(event.target as Element).closest("button, summary, details")) void openWorkspace(session.id); }}
              style={{ ...inlineCardStyle, cursor: disabled ? "default" : "pointer", "--collection-delay": `${Math.min(index, tokens.motion.collection.staggerCap) * tokens.motion.collection.staggerMs}ms`, position: "relative", background: tokens.panel.surface, borderLeft: `3px solid ${session.id === activeSessionId ? tokens.panel.accentSoft : "transparent"}` } as CSSProperties}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.panel.space.sm }}>
                <button type="button" data-workspace-session={session.id} aria-current={session.id === activeSessionId ? "true" : undefined}
                  disabled={disabled} onClick={() => void openWorkspace(session.id)}
                  style={{ ...tokens.panel.type.cardTitle, fontFamily: tokens.font.sans, display: "flex", alignItems: "center", gap: tokens.panel.space.sm, flex: 1, minWidth: 0, minHeight: tokens.panel.size.button, textAlign: "left", padding: 0, border: 0, background: "transparent", color: tokens.panel.ink, cursor: disabled ? "default" : "pointer", overflowWrap: "anywhere" }}>
                  <span data-workspace-mode-icon={session.mode} aria-hidden="true" style={{ width: tokens.panel.size.modeDot, height: tokens.panel.size.modeDot, borderRadius: tokens.panel.radius.pill, background: getModeTheme(session.mode).accent, flexShrink: 0 }} />
                  {workspaceName(session)}
                </button>
                {onRename || onDelete ? (
                  <details data-workspace-management={session.id} style={{ position: "relative" }}>
                    <summary aria-label={`管理 ${workspaceName(session)}`} style={{ listStyle: "none", display: "flex", alignItems: "center", justifyContent: "center", width: tokens.panel.size.button, height: tokens.panel.size.button, color: tokens.panel.ink3, cursor: "pointer" }}><MoreHorizontal size={tokens.panel.size.icon} strokeWidth={1.75} aria-hidden="true" /></summary>
                    <div style={{ position: "absolute", right: 0, zIndex: 2, display: "grid", gap: tokens.panel.space.xs, padding: tokens.panel.space.sm, background: tokens.panel.surface, border: `1px solid ${tokens.panel.border}`, borderRadius: tokens.panel.radius.md, boxShadow: tokens.panel.shadow.popover }}>
                      {onRename ? <button type="button" disabled={disabled} onClick={() => { setManagement({ sessionId: session.id, action: "rename" }); setRenameName(session.name); setShowCreate(false); setError(null); }} style={{ ...buttonStyle, whiteSpace: "nowrap" }}>重新命名</button> : null}
                      {onDelete ? <button type="button" disabled={disabled} onClick={() => { setManagement({ sessionId: session.id, action: "delete" }); setShowCreate(false); setError(null); }} style={buttonStyle}>刪除</button> : null}
                    </div>
                  </details>
                ) : null}
              </div>
              <p style={{ ...tokens.panel.type.bodySm, color: tokens.panel.ink3, margin: 0 }}>{purpose}</p>
              <footer style={{ display: "flex", alignItems: "center", gap: tokens.panel.space.sm, flexWrap: "wrap" }}>
                {previews.length ? <span style={{ display: "flex", paddingLeft: tokens.panel.space.sm, flexShrink: 0 }}>
                  {previews.map(post => <span key={post.key} data-workspace-preview="" style={{ display: "flex", marginLeft: -tokens.panel.space.sm, border: `${tokens.panel.space.xxs}px solid ${tokens.panel.surface}`, borderRadius: tokens.panel.radius.pill }}><CollectionThumbnail post={post} miniature /></span>)}
                </span> : null}
                <span style={{ ...tokens.panel.type.meta, color: tokens.panel.ink3, fontVariantNumeric: "tabular-nums" }}>{count} 篇{readingCount ? ` · ${readingCount} 讀緊` : ""}{lastSavedRelative ? ` · 最近收藏 ${lastSavedRelative}前` : ""}</span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", justifyItems: "start", gap: tokens.panel.space.md, paddingTop: tokens.panel.space.xxl }}>
          <p style={{ ...tokens.panel.type.heading, color: tokens.panel.ink3, margin: 0 }}>未有工作區</p>
          <button type="button" disabled={disabled} onClick={() => { setShowCreate(true); setManagement(null); setError(null); }} style={buttonStyle}>建立第一個工作區</button>
        </div>
      )}
    </section>
  );
}
