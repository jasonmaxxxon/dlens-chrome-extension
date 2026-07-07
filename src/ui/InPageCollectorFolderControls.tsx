import { IconButton, PrimaryButton, SecondaryButton, surfaceCardStyle, TOKENS } from "./components";
import { getSessionDisplayName } from "../state/store-helpers";
import { tokens } from "./tokens";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";
import type { SessionRecord, Topic } from "../state/types";

function formatWorkspaceOptionLabel(folder: Pick<SessionRecord, "name" | "mode" | "items">): string {
  const name = getSessionDisplayName(folder);
  if (folder.mode === "topic") {
    return name;
  }
  return `${name} (${folder.items.length})`;
}

function formatTopicOptionLabel(topic: Pick<Topic, "name">): string {
  return topic.name.trim() || "未命名主題";
}

function buildTopicStatusBadges(app: InPageCollectorAppModel): string[] {
  const inboxCount = app.signals.filter((signal) => signal.inboxStatus === "unprocessed").length;
  const topicCount = app.topics.length;
  return [`${inboxCount} 未分流`, `${topicCount} 主題`];
}

export function InPageCollectorFolderControls({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, activeFolder, showFolderPrompt, isRenamingFolder, editingFolderName, folderName } = app;
  const activeMode = app.activeFolderMode ?? activeFolder?.mode ?? "archive";

  if (activeMode === "product" || activeMode === "pr-evidence") {
    return null;
  }

  if (activeMode === "topic") {
    const selectedTopicId = Object.prototype.hasOwnProperty.call(app, "collectTargetTopicId")
      ? app.collectTargetTopicId || ""
      : app.selectedTopicId || app.snapshot?.tab.collectionTopicId || "";
    return (
      <div
        data-workspace-folder-strip="compact"
        data-topic-target-strip="true"
        style={surfaceCardStyle({
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 10,
          background: tokens.color.utilitySurface
        })}
      >
        <select
          value={selectedTopicId}
          onChange={(event) => {
            if (!event.target.value) {
              return;
            }
            app.setIsRenamingFolder(false);
            app.onSelectTopicTarget(event.target.value);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: 999,
            border: `1px solid ${tokens.color.line}`,
            padding: "8px 12px",
            background: tokens.color.elevated,
            fontSize: 12,
            fontWeight: 600,
            color: tokens.color.ink,
            outline: "none",
            transition: tokens.motion.transitionFast
          }}
        >
          <option value="" disabled>
            {app.topics.length ? "選擇主題" : "尚無主題"}
          </option>
          {app.topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {formatTopicOptionLabel(topic)}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {buildTopicStatusBadges(app).map((label) => (
            <span
              key={label}
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: tokens.color.cyan,
                padding: "3px 8px",
                borderRadius: 999,
                background: tokens.color.cyanSoft,
                whiteSpace: "nowrap"
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <SecondaryButton onClick={() => void app.onCreateTopic()} style={{ padding: "7px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
          新建主題
        </SecondaryButton>
      </div>
    );
  }

  return (
    <>
      <div
        data-workspace-folder-strip="compact"
        style={surfaceCardStyle({
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 10,
          background: tokens.color.utilitySurface
        })}
      >
        <select
          value={snapshot?.global.activeSessionId || ""}
          onChange={(event) => {
            if (!event.target.value) {
              return;
            }
            app.setIsRenamingFolder(false);
            void app.onSetActiveSession(event.target.value);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: 999,
            border: `1px solid ${tokens.color.line}`,
            padding: "8px 12px",
            background: tokens.color.elevated,
            fontSize: 12,
            fontWeight: 600,
            color: tokens.color.ink,
            outline: "none",
            transition: tokens.motion.transitionFast
          }}
        >
          <option value="" disabled>
            {snapshot?.global.sessions.length ? "Select a folder" : "No folders yet"}
          </option>
          {snapshot?.global.sessions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {formatWorkspaceOptionLabel(folder)}
            </option>
          ))}
        </select>
        {activeFolder ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: tokens.color.cyan,
              padding: "3px 8px",
              borderRadius: 999,
              background: tokens.color.cyanSoft,
              whiteSpace: "nowrap"
            }}
          >
            {activeFolder.items.length} saved
          </span>
        ) : null}
        <SecondaryButton onClick={() => app.setShowFolderPrompt((current) => !current)} style={{ padding: "7px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
          + New
        </SecondaryButton>
        <IconButton
          label="Rename folder"
          onClick={() => {
            app.setEditingFolderName(activeFolder?.name || "");
            app.setIsRenamingFolder((current) => !current);
          }}
          disabled={!activeFolder}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4l10-10-4-4L4 16v4Z" />
            <path d="m13 7 4 4" />
          </svg>
        </IconButton>
        <IconButton label="Delete folder" onClick={() => void app.onDeleteFolder()} disabled={!activeFolder}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </IconButton>
      </div>

      {isRenamingFolder && activeFolder ? (
        <div style={{ ...surfaceCardStyle({ display: "grid", gap: 8, background: tokens.color.elevated }) }}>
          <input
            value={editingFolderName}
            onChange={(event) => app.setEditingFolderName(event.target.value)}
            placeholder="Rename this folder"
            style={{
              borderRadius: TOKENS.pillRadius,
              border: `1px solid ${TOKENS.glassBorder}`,
              padding: "9px 12px",
              background: tokens.color.elevated,
              color: tokens.color.ink,
              fontSize: 13,
              outline: "none",
              transition: TOKENS.transition
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <PrimaryButton onClick={() => void app.onRenameFolder()} disabled={!editingFolderName.trim()}>
              Save name
            </PrimaryButton>
            <SecondaryButton onClick={() => app.setIsRenamingFolder(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      ) : null}

      {showFolderPrompt ? (
        <div style={{ ...surfaceCardStyle({ display: "grid", gap: 8, background: tokens.color.elevated }) }}>
          <input
            value={folderName}
            onChange={(event) => app.setFolderName(event.target.value)}
            placeholder="Name this folder"
            style={{
              borderRadius: TOKENS.pillRadius,
              border: `1px solid ${TOKENS.glassBorder}`,
              padding: "9px 12px",
              background: tokens.color.elevated,
              color: tokens.color.ink,
              fontSize: 13,
              outline: "none",
              transition: TOKENS.transition
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <PrimaryButton onClick={() => void app.onCreateFolder(false)}>Create folder</PrimaryButton>
            <SecondaryButton onClick={() => void app.onCreateFolder(true)} disabled={!app.preview}>
              Create + save
            </SecondaryButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

export const inPageCollectorFolderControlsTestables = {
  formatWorkspaceOptionLabel,
  formatTopicOptionLabel,
  buildTopicStatusBadges
};
