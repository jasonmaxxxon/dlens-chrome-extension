import type { ReactNode } from "react";
import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { SessionProcessingSummary, WorkerStatus } from "../state/processing-state";
import type { SessionItem, SessionRecord } from "../state/types";
import { PrimaryButton, SecondaryButton, TOKENS, lineClamp, statusTheme, surfaceCardStyle } from "./components";

interface LibraryViewProps {
  activeFolder: SessionRecord | null;
  activeItem: SessionItem | null;
  optimisticQueuedIds: string[];
  workerStatus: WorkerStatus | null;
  isStartingProcessing: boolean;
  processAllLabel: string;
  processingSummary: SessionProcessingSummary;
  canPrev: boolean;
  canNext: boolean;
  onSelectItem: (itemId: string) => void;
  onProcessAll: () => void;
  onMoveSelection: (direction: -1 | 1) => void;
  onQueueItem: () => void;
  renderMetrics: (descriptor: TargetDescriptor | null | undefined) => ReactNode;
}

export function LibraryView({
  activeFolder,
  activeItem,
  optimisticQueuedIds,
  workerStatus,
  isStartingProcessing,
  processAllLabel,
  processingSummary,
  canPrev,
  canNext,
  onSelectItem,
  onProcessAll,
  onMoveSelection,
  onQueueItem,
  renderMetrics
}: LibraryViewProps) {
  if (!activeFolder) {
    return (
      <div style={{ ...surfaceCardStyle({ color: TOKENS.softInk, fontSize: 13 }) }}>
        Create a folder before building a library.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...surfaceCardStyle({ padding: 10, display: "grid", gap: 8 }) }}>
        <div style={{ fontSize: 13, fontWeight: 800, padding: "2px 4px" }}>
          Saved in this folder
        </div>
        {activeFolder.items.length ? (
          activeFolder.items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              style={{
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 14,
                border: item.id === activeItem?.id ? "1px solid rgba(99,102,241,0.35)" : `1px solid ${TOKENS.glassBorder}`,
                background: item.id === activeItem?.id ? TOKENS.accentSoft : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                transition: TOKENS.transition
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: TOKENS.softInk }}>#{index + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{item.descriptor.author_hint || "Unknown"}</div>
                <div style={{ fontSize: 12, color: TOKENS.subInk, ...lineClamp(1) }}>{item.descriptor.text_snippet || "-"}</div>
              </div>
              <span
                style={{
                  ...statusTheme(optimisticQueuedIds.includes(item.id) ? "queued" : item.status),
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 800
                }}
              >
                {optimisticQueuedIds.includes(item.id) ? "queued" : item.status}
              </span>
            </button>
          ))
        ) : (
          <div style={{ padding: "6px 4px", color: TOKENS.softInk, fontSize: 12 }}>
            No saved posts yet.
          </div>
        )}
      </div>

      <div style={{ ...surfaceCardStyle({ display: "grid", gap: 10 }) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: TOKENS.softInk }}>Selected item</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>
              {activeItem ? `#${activeFolder.items.findIndex((item) => item.id === activeItem.id) + 1} ${activeItem.descriptor.author_hint || ""}` : "Nothing selected"}
            </div>
          </div>
          {activeItem ? (
            <span
              style={{
                ...statusTheme(optimisticQueuedIds.includes(activeItem.id) ? "queued" : activeItem.status),
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 800
              }}
            >
              {optimisticQueuedIds.includes(activeItem.id) ? "queued" : activeItem.status}
            </span>
          ) : null}
        </div>

        <PrimaryButton
          onClick={onProcessAll}
          disabled={isStartingProcessing || workerStatus === "draining"}
          style={{ width: "100%" }}
        >
          {processAllLabel}
        </PrimaryButton>
        <div style={{ fontSize: 12, color: TOKENS.softInk }}>
          {workerStatus === "draining"
            ? "Worker is draining queued captures and waiting for analysis snapshots."
            : processingSummary.pending > 0
              ? "Saved items are waiting for Process All."
              : "Select another post or switch to Compare once two items are ready."}
        </div>

        {activeItem ? (
          <>
            <div style={{ fontSize: 13, color: TOKENS.subInk, ...lineClamp(3) }}>
              {activeItem.descriptor.text_snippet || "-"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{renderMetrics(activeItem.descriptor)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <SecondaryButton onClick={() => onMoveSelection(-1)} disabled={!canPrev}>
                Prev
              </SecondaryButton>
              <SecondaryButton onClick={() => onMoveSelection(1)} disabled={!canNext}>
                Next
              </SecondaryButton>
              <PrimaryButton onClick={onQueueItem} disabled={workerStatus === "draining"}>
                Queue this
              </PrimaryButton>
            </div>

            {activeItem.status === "succeeded" && activeItem.commentsPreview.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Raw comments</div>
                {activeItem.commentsPreview.map((comment, index) => (
                  <div
                    key={comment.id}
                    style={{
                      padding: 10,
                      borderRadius: 14,
                      background: "#f8fafc",
                      border: "1px solid #e4e7ec"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {index + 1}. {comment.author || "Unknown"}
                      </span>
                      <span style={{ fontSize: 11, color: TOKENS.softInk }}>
                        {comment.likeCount !== null ? `${comment.likeCount} likes` : "No like count"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.subInk }}>{comment.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: TOKENS.softInk, fontSize: 12 }}>
                {activeItem.status === "succeeded"
                  ? "No raw comments available yet."
                  : `Comments unlock after crawl succeeds. Current status: ${activeItem.status}.`}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: TOKENS.softInk, fontSize: 12 }}>Choose a saved item to inspect it here.</div>
        )}
      </div>
    </div>
  );
}
