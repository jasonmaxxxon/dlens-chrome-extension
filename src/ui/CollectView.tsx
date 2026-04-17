import type { TargetDescriptor } from "../contracts/target-descriptor";

const AR = {
  blue:    "#0071e3",
  ink:     "#1d1d1f",
  canvas:  "#f2f2f7",
  card:    "#ffffff",
  softInk: "rgba(0,0,0,0.5)",
  muteInk: "rgba(0,0,0,0.35)",
  line:    "rgba(0,0,0,0.07)",
  green:   "#34c759",
} as const;

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
    <div style={{ padding: "12px 12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ paddingBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: AR.muteInk, letterSpacing: 0.2, marginBottom: 2 }}>
          {selectionMode ? "收集模式啟動中" : "收集"}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: AR.ink, letterSpacing: -0.3 }}>
          快速判斷，存入資料夾
        </div>
        <div style={{ fontSize: 12, color: AR.softInk, marginTop: 3, lineHeight: 1.5 }}>
          滑過貼文即可預覽，按 S 儲存
        </div>
      </div>

      {/* Preview Card */}
      <div
        style={{
          background: AR.card,
          borderRadius: 12,
          padding: "12px 14px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
          border: `1px solid ${AR.line}`,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {/* Avatar */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: hasPreview
                ? `linear-gradient(135deg, ${AR.blue}, #818cf8)`
                : AR.canvas,
              color: hasPreview ? "#fff" : AR.muteInk,
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {hasPreview ? avatarInitial(preview?.author_hint) : "·"}
          </div>

          {/* Content */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: AR.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {preview?.author_hint || "尚無預覽"}
              </div>
              {hasPreview && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: isSaved ? AR.green : AR.blue,
                    background: isSaved ? "rgba(52,199,89,0.1)" : "rgba(0,113,227,0.08)",
                    borderRadius: 6,
                    padding: "2px 7px",
                  }}
                >
                  {isSaved ? "已儲存" : "預覽中"}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 12,
                color: AR.softInk,
                lineHeight: 1.55,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {preview?.text_snippet || "將游標移到 Threads 貼文上，這裡會顯示快速預覽。"}
            </div>
          </div>
        </div>

        {/* Folder row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: `1px solid ${AR.line}`,
          }}
        >
          <div style={{ fontSize: 11, color: AR.muteInk }}>
            資料夾：<span style={{ fontWeight: 600, color: AR.ink }}>{folderName}</span>
          </div>
          {hasPreview && (
            <button
              onClick={onOpenPreview}
              disabled={!preview?.post_url}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: AR.blue,
                background: "none",
                border: "none",
                padding: 0,
                cursor: preview?.post_url ? "pointer" : "default",
                opacity: preview?.post_url ? 1 : 0.4,
              }}
            >
              在 Threads 開啟 →
            </button>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={onSavePreview}
          disabled={!hasPreview || isSaved}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: !hasPreview || isSaved ? AR.canvas : AR.blue,
            color: !hasPreview || isSaved ? AR.muteInk : "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: !hasPreview || isSaved ? "default" : "pointer",
            letterSpacing: -0.1,
          }}
        >
          {isSaved ? "已儲存到資料夾" : "儲存到資料夾"}
        </button>
      </div>

      {/* Collect mode toggle */}
      <div
        style={{
          background: AR.card,
          borderRadius: 12,
          padding: "10px 14px",
          border: `1px solid ${AR.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: AR.ink, marginBottom: 1 }}>
            {selectionMode ? "收集模式：開啟" : "收集模式：關閉"}
          </div>
          <div style={{ fontSize: 11, color: AR.muteInk }}>
            {selectionMode
              ? "移動游標選取貼文"
              : "開啟後滑過貼文即可快速預覽"}
          </div>
        </div>
        <button
          onClick={onToggleCollectMode}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: selectionMode ? AR.canvas : AR.blue,
            color: selectionMode ? AR.ink : "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
            letterSpacing: -0.1,
          }}
        >
          {selectionMode ? "關閉" : "開啟"}
        </button>
      </div>

      {/* Keyboard hints */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "6px 2px",
        }}
      >
        {([
          { key: "S", label: "儲存" },
          { key: "Esc", label: "離開" },
        ] as { key: string; label: string }[]).map(({ key, label }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <kbd
              style={{
                padding: "2px 6px",
                borderRadius: 6,
                background: AR.card,
                border: `1px solid ${AR.line}`,
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                fontSize: 11,
                fontWeight: 600,
                color: AR.ink,
                fontFamily: "-apple-system, monospace",
              }}
            >
              {key}
            </kbd>
            <span style={{ fontSize: 11, color: AR.muteInk }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
