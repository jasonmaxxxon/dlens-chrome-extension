import type { FolderMode, PopupPage } from "./state/types";

export type DlensBuildVariant = "full" | "pr-only";

type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
};

export function normalizeBuildVariant(value: unknown): DlensBuildVariant {
  return value === "pr-only" ? "pr-only" : "full";
}

export function resolveBuildVariant(env: Record<string, unknown> | undefined): DlensBuildVariant {
  return normalizeBuildVariant(env?.VITE_DLENS_BUILD_VARIANT);
}

export const DLENS_BUILD_VARIANT = resolveBuildVariant((import.meta as ViteImportMeta).env);
export const IS_PR_ONLY_BUILD = DLENS_BUILD_VARIANT === "pr-only";

export function resolveAllowedPagesForBuildVariant(
  variant: DlensBuildVariant,
  defaultPages: Record<FolderMode, PopupPage[]>
): Record<FolderMode, PopupPage[]> {
  if (variant !== "pr-only") {
    return defaultPages;
  }
  return {
    archive: ["pr-evidence", "collect"],
    topic: ["pr-evidence", "collect"],
    product: ["pr-evidence", "collect"],
    "pr-evidence": ["pr-evidence", "collect"]
  };
}
