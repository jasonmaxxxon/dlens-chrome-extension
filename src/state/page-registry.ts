import type { FolderMode, MainPage, PopupPage } from "./types.ts";

export type PageWorkspace = FolderMode | "shared" | "utility";
export type PageComponentKind = "collection" | "topics" | "pr-evidence" | "settings";
export interface PageRegistryEntry {
  key: PopupPage;
  mode: PageWorkspace;
  railVisible: boolean;
  componentKind: PageComponentKind;
  allowedFrom: ReadonlyArray<FolderMode>;
  homeFor?: ReadonlyArray<FolderMode>;
  bypassModeGuard?: boolean;
}

export const PAGE_REGISTRY: ReadonlyArray<PageRegistryEntry> = [
  { key: "collection", mode: "shared", railVisible: false, componentKind: "collection", allowedFrom: ["archive", "product"], homeFor: ["archive", "product"], bypassModeGuard: true },
  { key: "topics", mode: "topic", railVisible: true, componentKind: "topics", allowedFrom: ["topic"], homeFor: ["topic"] },
  { key: "pr-evidence", mode: "pr-evidence", railVisible: true, componentKind: "pr-evidence", allowedFrom: ["pr-evidence"], homeFor: ["pr-evidence"] },
  { key: "settings", mode: "utility", railVisible: false, componentKind: "settings", allowedFrom: ["archive", "topic", "product", "pr-evidence"], bypassModeGuard: true }
];
const PAGE_BY_KEY = new Map(PAGE_REGISTRY.map(entry => [entry.key, entry]));
/** Old stored route strings are allowed inputs, but are never live registry entries. */
export function isKnownPage(page: string): boolean { return PAGE_BY_KEY.has(page as PopupPage); }
function readPageEntry(page: PopupPage): PageRegistryEntry {
  const entry = PAGE_BY_KEY.get(page);
  if (!entry) throw new Error(`Unknown popup page: ${page}`);
  return entry;
}
export function getAllowedPagesForMode(mode: FolderMode): PopupPage[] { return PAGE_REGISTRY.filter(entry => entry.allowedFrom.includes(mode)).map(entry => entry.key); }
export function getRailPagesForMode(mode: FolderMode): MainPage[] { return PAGE_REGISTRY.filter(entry => entry.railVisible && entry.allowedFrom.includes(mode)).map(entry => entry.key as MainPage); }
export function getHomePageForMode(mode: FolderMode): MainPage { return PAGE_REGISTRY.find(entry => entry.homeFor?.includes(mode))?.key as MainPage ?? "collection"; }
export function getPageComponentKind(page: PopupPage): PageComponentKind { return readPageEntry(page).componentKind; }
export function isPageComponentKind(page: PopupPage, kind: PageComponentKind): boolean { return isKnownPage(page) && getPageComponentKind(page) === kind; }
export function isPageRailVisible(page: PopupPage): boolean { return isKnownPage(page) && readPageEntry(page).railVisible; }
export function shouldBypassModeGuard(page: PopupPage): boolean { return isKnownPage(page) && Boolean(readPageEntry(page).bypassModeGuard); }
