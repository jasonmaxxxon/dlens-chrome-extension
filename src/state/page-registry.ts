import type { FolderMode, MainPage, PopupPage } from "./types.ts";

export type PageWorkspace = FolderMode | "shared" | "utility";
export type PageComponentKind =
  | "library"
  | "collect"
  | "compare"
  | "casebook"
  | "inbox"
  | "product-signal"
  | "pr-evidence"
  | "result"
  | "settings"
  | "audit-report";

export interface PageRegistryEntry {
  key: PopupPage;
  mode: PageWorkspace;
  width: number;
  railVisible: boolean;
  componentKind: PageComponentKind;
  allowedFrom: ReadonlyArray<FolderMode>;
  homeFor?: ReadonlyArray<FolderMode>;
  orderByMode?: Partial<Record<FolderMode, number>>;
  bypassModeGuard?: boolean;
}

export const PAGE_POPUP_WIDTH = 720;

export const PAGE_REGISTRY: ReadonlyArray<PageRegistryEntry> = [
  {
    key: "library",
    mode: "archive",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "library",
    allowedFrom: ["archive"],
    homeFor: ["archive"],
    orderByMode: { archive: 1 }
  },
  {
    key: "collect",
    mode: "shared",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "collect",
    allowedFrom: ["archive", "topic", "product", "pr-evidence"],
    orderByMode: { archive: 2, topic: 1, product: 4, "pr-evidence": 2 }
  },
  {
    key: "compare",
    mode: "archive",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "compare",
    allowedFrom: []
  },
  {
    key: "result",
    mode: "shared",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "result",
    allowedFrom: [],
    bypassModeGuard: true
  },
  {
    key: "casebook",
    mode: "topic",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "casebook",
    allowedFrom: []
  },
  {
    key: "topics",
    mode: "topic",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "casebook",
    allowedFrom: ["topic"],
    homeFor: ["topic"],
    orderByMode: { topic: 2 }
  },
  {
    key: "topic-detail",
    mode: "topic",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "casebook",
    allowedFrom: [],
    bypassModeGuard: true
  },
  {
    key: "inbox",
    mode: "topic",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "inbox",
    allowedFrom: []
  },
  {
    key: "saved-signals",
    mode: "product",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "product-signal",
    allowedFrom: ["product"],
    homeFor: ["product"],
    orderByMode: { product: 1 }
  },
  {
    key: "classification",
    mode: "product",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "product-signal",
    allowedFrom: ["product"],
    orderByMode: { product: 2 }
  },
  {
    key: "actionable-filter",
    mode: "product",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "product-signal",
    allowedFrom: ["product"],
    orderByMode: { product: 3 }
  },
  {
    key: "pr-evidence",
    mode: "pr-evidence",
    width: PAGE_POPUP_WIDTH,
    railVisible: true,
    componentKind: "pr-evidence",
    allowedFrom: ["pr-evidence"],
    homeFor: ["pr-evidence"],
    orderByMode: { "pr-evidence": 1 }
  },
  {
    key: "settings",
    mode: "utility",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "settings",
    allowedFrom: ["topic"],
    orderByMode: { topic: 3 },
    bypassModeGuard: true
  },
  {
    key: "audit-report",
    mode: "utility",
    width: PAGE_POPUP_WIDTH,
    railVisible: false,
    componentKind: "audit-report",
    allowedFrom: []
  }
];

const PAGE_BY_KEY = new Map(PAGE_REGISTRY.map((entry) => [entry.key, entry]));

function readPageEntry(page: PopupPage): PageRegistryEntry {
  const entry = PAGE_BY_KEY.get(page);
  if (!entry) {
    throw new Error(`Unknown popup page: ${page}`);
  }
  return entry;
}

function isMainPage(page: PopupPage): page is MainPage {
  return page !== "settings" && page !== "audit-report";
}

export function getAllowedPagesForMode(mode: FolderMode): PopupPage[] {
  return PAGE_REGISTRY
    .filter((entry) => entry.allowedFrom.includes(mode))
    .sort((a, b) => (a.orderByMode?.[mode] ?? Number.MAX_SAFE_INTEGER) - (b.orderByMode?.[mode] ?? Number.MAX_SAFE_INTEGER))
    .map((entry) => entry.key);
}

export function getRailPagesForMode(mode: FolderMode): MainPage[] {
  const pages: MainPage[] = [];
  for (const entry of PAGE_REGISTRY
    .filter((candidate) => candidate.railVisible && candidate.allowedFrom.includes(mode))
    .sort((a, b) => (a.orderByMode?.[mode] ?? Number.MAX_SAFE_INTEGER) - (b.orderByMode?.[mode] ?? Number.MAX_SAFE_INTEGER))) {
    if (isMainPage(entry.key)) {
      pages.push(entry.key);
    }
  }
  return pages;
}

export function getHomePageForMode(mode: FolderMode): MainPage {
  const home = PAGE_REGISTRY.find((entry) => entry.homeFor?.includes(mode));
  if (home && isMainPage(home.key)) {
    return home.key;
  }
  return getAllowedPagesForMode(mode).find(isMainPage) ?? "library";
}

export function getPageComponentKind(page: PopupPage): PageComponentKind {
  return readPageEntry(page).componentKind;
}

export function isPageComponentKind(page: PopupPage, componentKind: PageComponentKind): boolean {
  return getPageComponentKind(page) === componentKind;
}

export function isPageRailVisible(page: PopupPage): boolean {
  return readPageEntry(page).railVisible;
}

export function shouldBypassModeGuard(page: PopupPage): boolean {
  return Boolean(readPageEntry(page).bypassModeGuard);
}

export function getPageWidth(page: PopupPage): number {
  return readPageEntry(page).width;
}
