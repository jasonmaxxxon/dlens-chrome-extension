import { Archive, Box, Compass, Shield } from "lucide-react";
import type { FolderMode } from "../state/types";
import { getModeTheme, tokens } from "./tokens";

const icons = { topic: Compass, product: Box, "pr-evidence": Shield, archive: Archive };
export function WorkspaceModeIcon({ mode }: { mode: FolderMode }) {
  const Icon = icons[mode];
  const theme = getModeTheme(mode);
  return <span data-workspace-mode-icon={mode} aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0,
    width: tokens.collection.modeTileSize, height: tokens.collection.modeTileSize, borderRadius: tokens.radius.card,
    background: theme.accentSoft, color: theme.accent }}><Icon size={tokens.spacing.section} /></span>;
}
