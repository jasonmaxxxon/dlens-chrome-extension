import type { FolderMode } from "../state/types";
import type { CollectionFilter } from "./collection-browser";

/** Cards, reader links and side-panel open requests share the same destination. */
export function workspaceCollectionDestination(mode: FolderMode): {
  tab: "collection" | "workspaces";
  workspaceOpen: boolean;
  filter: CollectionFilter;
} {
  return mode === "product" || mode === "archive"
    ? { tab: "collection", workspaceOpen: false, filter: mode }
    : { tab: "workspaces", workspaceOpen: true, filter: "all" };
}
