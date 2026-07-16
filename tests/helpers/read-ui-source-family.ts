import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readSourceTree, type SourceFileEntry } from "./read-source-tree.ts";

// Each family = [existing facade file, future sibling directory]. Both paths
// are repo-root-relative. The sibling directory does not exist yet for any
// family today — it appears only once a wave splits the facade file apart —
// so every reader in this module must tolerate a missing sibling dir.
export const UI_SOURCE_FAMILIES = {
  LibraryView: ["src/ui/LibraryView.tsx", "src/ui/library"],
  ProductSignalViews: ["src/ui/ProductSignalViews.tsx", "src/ui/product"],
  CompareView: ["src/ui/CompareView.tsx", "src/ui/compare"],
  TopicDetailView: ["src/ui/TopicDetailView.tsx", "src/ui/topic"],
  PrEvidenceViews: ["src/ui/PrEvidenceViews.tsx", "src/ui/pr-evidence"]
} as const;

export type UiSourceFamilyName = keyof typeof UI_SOURCE_FAMILIES;

// tests/helpers/read-ui-source-family.ts -> repo root is two levels up.
const REPO_ROOT = new URL("../../", import.meta.url);

/**
 * Reads every source file belonging to a family: the facade file (if it
 * still exists) plus every .ts/.tsx file under the sibling directory (if
 * that directory has been created by a split). Both `facadeRepoPath` and
 * `siblingDirRepoPath` are repo-root-relative, e.g. "src/ui/LibraryView.tsx"
 * and "src/ui/library". Generic over any facade/sibling pair so fixtures can
 * exercise the same walk the real UI families use.
 */
export function readSourceFamily(facadeRepoPath: string, siblingDirRepoPath: string): SourceFileEntry[] {
  const entries: SourceFileEntry[] = [];

  const facadePath = fileURLToPath(new URL(facadeRepoPath, REPO_ROOT));
  if (existsSync(facadePath)) {
    entries.push({ relativePath: facadeRepoPath, source: readFileSync(facadePath, "utf8") });
  }

  const siblingDirUrl = new URL(`${siblingDirRepoPath}/`, REPO_ROOT);
  const siblingDirPath = fileURLToPath(siblingDirUrl);
  if (existsSync(siblingDirPath)) {
    for (const entry of readSourceTree(siblingDirUrl)) {
      entries.push({ relativePath: `${siblingDirRepoPath}/${entry.relativePath}`, source: entry.source });
    }
  }

  return entries;
}

/** Reads a named UI source family from `UI_SOURCE_FAMILIES`. */
export function readUiSourceFamily(name: UiSourceFamilyName): SourceFileEntry[] {
  const [facadeRepoPath, siblingDirRepoPath] = UI_SOURCE_FAMILIES[name];
  return readSourceFamily(facadeRepoPath, siblingDirRepoPath);
}
