---
name: ui-ux-pro-max
description: Use when DLens needs a focused UI usability or design-reference lookup, such as keyboard focus, narrow layouts, long content, motion, or React rendering. Routine edits should follow the shipped UI without generating a new design system.
---

# DLens UI/UX 參考

這是 DLens repo 的 canonical UIUX 入口。先讀根 CLAUDE.md 的設計與 boundary 規則；數值權威是 `src/ui/tokens.ts`，意圖是 `src/ui/tokens-intent.md`。資料庫只是參考，不能覆蓋現行設計或宣稱瀏覽器驗收通過。

## 按需查詢

由此 SKILL.md 所在目錄解析 scripts/data；不要使用不存在的 `skills/ui-ux-pro-max` 根路徑。從 repo 或其子目錄可用：

```bash
DLENS_REPO_ROOT=$(git rev-parse --show-toplevel)
DLENS_UIUX_ROOT="$DLENS_REPO_ROOT/.agents/skills/ui-ux-pro-max"
python3 "$DLENS_UIUX_ROOT/scripts/search.py" --help
python3 "$DLENS_UIUX_ROOT/scripts/search.py" "keyboard focus long content" --domain ux
python3 "$DLENS_UIUX_ROOT/scripts/search.py" "event listener render" --stack react
```

若目前 cwd 在 repo 外，先以本次已確認的 checkout 絕對路徑設定 `DLENS_REPO_ROOT`；不要猜 Desktop 路徑。可用 domain/stack 以本地 help 為準。

- 本 repo 不執行 `--persist`，不新增 MASTER.md／DESIGN.md／第二份 palette。
- 全新視覺方向沿根規則先做 reference mockup，使用者選定後才落入 tokens；局部修正沿現行 UI。
- 查詢無結果要明說。精確第三方 API 行為另查對應版本原始文件。
- 驗收包括真實長內容、窄幅、鍵盤焦點、非同步狀態與 reduced-motion；本機查詢／mockup／測試和 Jason 真實 Chrome 是不同證據。

Claude 入口只連回本檔。完整 scripts/data 保留在此 canonical 目錄；上游歷史用法在 `references/upstream-skill-2026-09-07.md`，僅作來源參考，不是現行指令。
