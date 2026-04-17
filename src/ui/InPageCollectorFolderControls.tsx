import { IconButton, PrimaryButton, SecondaryButton, surfaceCardStyle, TOKENS } from "./components";
import { tokens } from "./tokens";
import type { InPageCollectorAppModel } from "./useInPageCollectorAppState";

export function InPageCollectorFolderControls({ app }: { app: InPageCollectorAppModel }) {
  const { snapshot, activeFolder, showFolderPrompt, isRenamingFolder, editingFolderName, folderName } = app;

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
              {folder.name} ({folder.items.length})
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
