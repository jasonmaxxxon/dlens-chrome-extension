import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { DEFAULT_SESSION_NAME_BY_MODE, getSessionDisplayName } from "../state/store-helpers";
import type { FolderMode, SessionRecord } from "../state/types";
import { MoreHorizontal } from "lucide-react";
import { buildWorkspaceCards } from "../viewmodel/collection-browser";
import { CollectionThumbnail } from "./CollectionBrowser";
import { getModeTheme, textStyles, tokens } from "./tokens";

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
  topic: "議題探索",
  product: "個人應用",
  "pr-evidence": "訊息核對"
};

const CREATION_MODES = ["topic", "product", "pr-evidence"] as const;

const buttonStyle: CSSProperties = {
  ...textStyles.meta,
  padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
  border: `1px solid ${tokens.color.line}`,
  borderRadius: tokens.radius.button,
  background: tokens.color.elevated,
  color: tokens.color.ink,
  cursor: "pointer"
};

const fieldStyle: CSSProperties = {
  ...textStyles.bodyTight,
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  padding: tokens.spacing.sm,
  border: `1px solid ${tokens.color.lineStrong}`,
  borderRadius: tokens.radius.xs,
  background: tokens.color.elevated,
  color: tokens.color.ink
};

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

  const cards = buildWorkspaceCards(sessions, nowMs);
  const visibleError = error ?? externalError;
  const managedSession = sessions.find((session) => session.id === management?.sessionId);

  return (
    <section data-workspace-home="true" aria-busy={pending || undefined} style={{ display: "grid", gap: tokens.spacing.lg, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacing.md, flexWrap: "wrap" }}>
        <span style={{ ...textStyles.meta, fontSize: tokens.collection.metaSize, color: tokens.color.softInk }}>{sessions.length} 個工作區</span>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={showCreate}
          onClick={() => { setShowCreate(!showCreate); setManagement(null); setError(null); }}
          style={{ ...buttonStyle, border: 0, background: "transparent", color: tokens.color.softInk }}
        >＋ 新工作區</button>
      </div>

      {showCreate ? (
        <form onSubmit={(event) => void createWorkspace(event)} style={{ display: "grid", gap: tokens.spacing.md }}>
          <label style={{ ...textStyles.meta, display: "grid", gap: tokens.spacing.xs, color: tokens.color.subInk }}>
            名稱
            <input name="workspace-name" value={name} onInput={(event) => setName(event.currentTarget.value)} disabled={disabled} required style={fieldStyle} />
          </label>
          <label style={{ ...textStyles.meta, display: "grid", gap: tokens.spacing.xs, color: tokens.color.subInk }}>
            用途
            <select name="workspace-type" value={mode} onChange={(event) => setMode(event.currentTarget.value as FolderMode)} disabled={disabled} style={fieldStyle}>
              {allowedCreationModes.map((value) => <option key={value} value={value}>{WORKSPACE_NAMES[value]}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: tokens.spacing.sm }}>
            <button type="submit" disabled={disabled || !name.trim()} style={buttonStyle}>{pending ? "建立中…" : "建立"}</button>
            <button type="button" disabled={disabled} onClick={() => { setShowCreate(false); setError(null); }} style={buttonStyle}>取消</button>
          </div>
        </form>
      ) : null}

      {management && managedSession ? (
        management.action === "rename" ? (
          <form onSubmit={(event) => void manageWorkspace(event)} style={{ display: "grid", gap: tokens.spacing.sm }}>
            <label style={{ ...textStyles.meta, display: "grid", gap: tokens.spacing.xs }}>
              重新命名「{workspaceName(managedSession)}」
              <input name="workspace-rename" value={renameName} onInput={(event) => setRenameName(event.currentTarget.value)} disabled={disabled} required style={fieldStyle} />
            </label>
            <div style={{ display: "flex", gap: tokens.spacing.sm }}>
              <button type="submit" disabled={disabled || !renameName.trim()} style={buttonStyle}>儲存名稱</button>
              <button type="button" disabled={disabled} onClick={() => { setManagement(null); setError(null); }} style={buttonStyle}>取消</button>
            </div>
          </form>
        ) : (
          <div role="alertdialog" aria-label="確認刪除工作區" style={{ display: "grid", gap: tokens.spacing.sm }}>
            <p style={{ ...textStyles.bodyTight, margin: 0 }}>確認刪除「{workspaceName(managedSession)}」及其中收藏？此操作無法復原。</p>
            <div style={{ display: "flex", gap: tokens.spacing.sm }}>
              <button type="button" disabled={disabled} onClick={() => void manageWorkspace()} style={buttonStyle}>確認刪除</button>
              <button type="button" disabled={disabled} onClick={() => { setManagement(null); setError(null); }} style={buttonStyle}>取消</button>
            </div>
          </div>
        )
      ) : null}

      {visibleError ? <p role="alert" style={{ ...textStyles.bodyTight, color: tokens.color.failed, margin: 0 }}>{visibleError}</p> : null}

      {sessions.length ? (
        <div style={{ display: "grid", gap: tokens.spacing.md, minWidth: 0 }}>
          {cards.map(({ session, purpose, count, previews, lastSavedRelative }, index) => (
            <article key={session.id} data-workspace-card="" data-collection-arrival="" style={{ "--collection-delay": `${Math.min(index, tokens.motion.collection.staggerCap) * tokens.motion.collection.staggerMs}ms`, position: "relative", display: "grid", gap: tokens.spacing.md, padding: tokens.spacing.section, border: `1px solid ${tokens.collection.hairline}`, borderRadius: tokens.radius.cardLg, background: tokens.color.surface } as CSSProperties}>
              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm }}>
                <span aria-hidden="true" style={{ width: tokens.collection.dotSize, height: tokens.collection.dotSize, borderRadius: tokens.radius.round, background: getModeTheme(session.mode).accent, flexShrink: 0 }} />
                <button type="button" data-workspace-session={session.id} aria-current={session.id === activeSessionId ? "true" : undefined}
                  disabled={disabled} onClick={() => void openWorkspace(session.id)}
                  style={{ ...textStyles.bodyTight, fontSize: tokens.collection.bodySize, fontWeight: 600, flex: 1, minWidth: 0, textAlign: "left", padding: 0, border: 0, background: "transparent", color: tokens.color.ink, cursor: disabled ? "default" : "pointer", overflowWrap: "anywhere" }}>
                  {workspaceName(session)}
                </button>
                {onRename || onDelete ? (
                  <details data-workspace-management={session.id} style={{ position: "relative" }}>
                    <summary aria-label={`管理 ${workspaceName(session)}`} style={{ listStyle: "none", display: "flex", padding: tokens.spacing.xs, color: tokens.color.softInk, cursor: "pointer" }}><MoreHorizontal size={tokens.spacing.section} aria-hidden="true" /></summary>
                    <div style={{ position: "absolute", right: 0, zIndex: 2, display: "grid", gap: tokens.spacing.xs, padding: tokens.spacing.sm, background: tokens.color.surface, border: `1px solid ${tokens.color.line}`, borderRadius: tokens.radius.card, boxShadow: tokens.shadow.card }}>
                      {onRename ? <button type="button" disabled={disabled} onClick={() => { setManagement({ sessionId: session.id, action: "rename" }); setRenameName(session.name); setShowCreate(false); setError(null); }} style={{ ...buttonStyle, whiteSpace: "nowrap" }}>重新命名</button> : null}
                      {onDelete ? <button type="button" disabled={disabled} onClick={() => { setManagement({ sessionId: session.id, action: "delete" }); setShowCreate(false); setError(null); }} style={buttonStyle}>刪除</button> : null}
                    </div>
                  </details>
                ) : null}
              </div>
              <p style={{ ...textStyles.bodyTight, color: tokens.color.softInk, margin: 0 }}>{purpose}</p>
              <footer style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm, flexWrap: "wrap" }}>
                {previews.length ? <span style={{ display: "flex", paddingLeft: tokens.collection.previewOverlap }}>
                  {previews.map(post => <span key={post.key} data-workspace-preview="" style={{ display: "flex", marginLeft: -tokens.collection.previewOverlap, border: `${tokens.collection.previewBorder}px solid ${tokens.color.surface}`, borderRadius: tokens.radius.pill }}><CollectionThumbnail post={post} miniature /></span>)}
                </span> : null}
                <span style={{ ...textStyles.meta, fontSize: tokens.collection.metaSize, color: tokens.color.softInk }}>{count} 篇{lastSavedRelative ? ` · 最近收藏 ${lastSavedRelative} 前` : ""}</span>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <p style={{ ...textStyles.body, color: tokens.color.softInk, margin: 0 }}>還沒有工作區</p>
      )}
    </section>
  );
}
