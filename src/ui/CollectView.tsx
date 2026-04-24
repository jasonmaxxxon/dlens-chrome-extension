import type { TargetDescriptor } from "../contracts/target-descriptor";
import {
  Kicker,
  ModeHeader,
  PrimaryButton,
  SecondaryButton,
  SideMark,
  Stamp,
  lineClamp,
  viewRootStyle
} from "./components";
import { tokens } from "./tokens";

function avatarInitial(author: string | undefined): string {
  if (!author) return "?";
  const clean = author.replace(/^@/, "");
  return clean.charAt(0).toUpperCase();
}

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
  const hasPreview = Boolean(preview);

  return (
    <div style={viewRootStyle({ gap: tokens.spacing.md })}>
      <ModeHeader
        mode="collect"
        kicker={selectionMode ? "Collect mode live" : "Collect"}
        title="快速判斷，存入資料夾"
        deck="指向 Threads 貼文即可預覽，按下存入資料夾。"
        stamp={<Stamp tone={selectionMode ? "accent" : "neutral"}>{selectionMode ? "Active" : "Idle"}</Stamp>}
      />

      <section
        data-paper-grain="true"
        style={{
          position: "relative",
          overflow: "hidden",
          display: "grid",
          gap: 12,
          padding: "14px 16px",
          borderRadius: tokens.radius.card,
          border: `1px solid ${tokens.color.line}`,
          background: `linear-gradient(180deg, ${tokens.color.elevated}, ${tokens.color.surface})`,
          boxShadow: tokens.shadow.shell
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Kicker tone="accent">{selectionMode ? "Live capture" : "Hover preview"}</Kicker>
          {hasPreview ? <Stamp tone={isSaved ? "success" : "accent"}>{isSaved ? "已儲存" : "預覽中"}</Stamp> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "3px minmax(0, 1fr)", gap: 12 }}>
          <SideMark tone={hasPreview ? "accent" : "muted"} />
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: tokens.radius.card,
                  background: hasPreview
                    ? `linear-gradient(135deg, ${tokens.color.accent}, ${tokens.color.accentMid})`
                    : tokens.color.neutralSurface,
                  color: hasPreview ? tokens.color.elevated : tokens.color.softInk,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: tokens.font.sans,
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: tokens.shadow.previewAvatar
                }}
              >
                {hasPreview ? avatarInitial(preview?.author_hint) : "·"}
              </div>

              <div style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {preview?.author_hint || "尚無預覽"}
                    </div>
                    <div style={{ fontSize: 10, color: tokens.color.softInk }}>
                      資料夾 · <span style={{ color: tokens.color.subInk }}>{folderName}</span>
                    </div>
                  </div>
                  {hasPreview ? (
                    <SecondaryButton onClick={onOpenPreview} disabled={!preview?.post_url} style={{ padding: "6px 10px", fontSize: 11 }}>
                      在 Threads 開啟
                    </SecondaryButton>
                  ) : null}
                </div>

                <div style={{ fontSize: 12, lineHeight: 1.65, color: tokens.color.subInk, ...lineClamp(3) }}>
                  {preview?.text_snippet || "將游標移到 Threads 貼文上，這裡會顯示快速預覽。"}
                </div>
              </div>
            </div>

            <PrimaryButton onClick={onSavePreview} disabled={!hasPreview || isSaved} style={{ width: "100%" }}>
              {isSaved ? "已儲存到資料夾" : "儲存到資料夾"}
            </PrimaryButton>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: 12,
          padding: "14px 16px",
          borderRadius: tokens.radius.card,
          border: `1px solid ${tokens.color.line}`,
          background: tokens.color.surface,
          boxShadow: tokens.shadow.glass
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <Kicker>{selectionMode ? "Selection active" : "Selection idle"}</Kicker>
            <div style={{ fontSize: 15, fontWeight: 700, color: tokens.color.ink }}>
              收集模式：{selectionMode ? "開啟" : "關閉"}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: tokens.color.subInk }}>
              {selectionMode ? "移動游標選取貼文。" : "開啟後滑過貼文即可快速預覽。"}
            </div>
          </div>
          <SecondaryButton onClick={onToggleCollectMode} style={{ padding: "8px 12px", fontSize: 11 }}>
            {selectionMode ? "關閉" : "開啟"}
          </SecondaryButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stamp tone="neutral">S · 儲存</Stamp>
          <Stamp tone="neutral">Esc · 離開</Stamp>
        </div>
      </section>
    </div>
  );
}
