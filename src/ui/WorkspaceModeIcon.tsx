import { Archive, Box, Compass, Shield } from "lucide-react";
import type { FolderMode } from "../state/types";
import { getModeTheme, tokens } from "./tokens";

const icons = { topic: Compass, product: Box, "pr-evidence": Shield, archive: Archive };
export function WorkspaceModeIcon({ mode }: { mode: FolderMode }) {
  const Icon = icons[mode];
  const theme = getModeTheme(mode);
  return <span data-workspace-mode-icon={mode} aria-hidden="true" style={{ display: "grid", placeItems: "center", flexShrink: 0,
    width: tokens.panel.size.icon, height: tokens.panel.size.icon,
    color: theme.accent }}><Icon size={tokens.panel.size.icon} strokeWidth={1.75} /></span>;
}
