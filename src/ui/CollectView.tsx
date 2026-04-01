import type { TargetDescriptor } from "../contracts/target-descriptor";
import { PreviewCard, PrimaryButton, TOKENS, surfaceCardStyle } from "./components";

interface CollectViewProps {
  preview: TargetDescriptor | null;
  folderName: string;
  isSaved: boolean;
  selectionMode: boolean;
  onSavePreview: () => void;
  onOpenPreview: () => void;
  onToggleCollectMode: () => void;
}

export function CollectView({
  preview,
  folderName,
  isSaved,
  selectionMode,
  onSavePreview,
  onOpenPreview,
  onToggleCollectMode
}: CollectViewProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PreviewCard
        descriptor={preview}
        folderName={folderName}
        isSaved={isSaved}
        onPrimary={onSavePreview}
        onOpen={onOpenPreview}
      />

      <div style={{ ...surfaceCardStyle({ display: "grid", gap: 10 }) }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Capture controls</div>
        <div style={{ fontSize: 12, color: TOKENS.softInk }}>Hover to preview. Press S to save. Press Esc to exit.</div>
        <PrimaryButton onClick={onToggleCollectMode}>
          {selectionMode ? "Exit collect mode" : "Collect mode"}
        </PrimaryButton>
      </div>
    </div>
  );
}
