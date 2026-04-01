import type { EngagementMetrics, EngagementPresent, TargetDescriptor, TargetSurface, TargetType } from "../contracts/target-descriptor";

const TIME_TOKEN_RE = /\b\d+\s*[smhdw]\b/i;
const UI_TOKENS = new Set([
  "follow",
  "following",
  "more",
  "translate",
  "like",
  "reply",
  "replies",
  "repost",
  "share",
  "view more",
  "view replies",
  "view more replies",
  "top",
  "view activity",
  "查看更多",
  "顯示",
  "更多",
  "查看回覆",
  "查看更多回覆"
]);

export type CandidateStrength = "soft" | "hard";

export interface CardCandidateSignals {
  isArticleLike: boolean;
  hasPermalink: boolean;
  isPressable: boolean;
  hasAuthorHint: boolean;
  hasEngagementRow: boolean;
  isComposer: boolean;
  isRecommendation: boolean;
  isFeedShell: boolean;
  widthRatio: number;
  permalinkCount: number;
  articleDescendants: number;
  nestedPermalinkCount: number;
}

export interface CardCandidate {
  root: HTMLElement | null;
  strength: CandidateStrength | null;
  score: number;
}

export function normalizeUrl(href: string): string {
  if (!href) {
    return "";
  }

  let normalized = "";
  if (/^https?:\/\//i.test(href)) {
    normalized = href.replace("threads.com", "threads.net");
  } else if (href.startsWith("//")) {
    normalized = `https:${href}`.replace("threads.com", "threads.net");
  } else if (href.startsWith("/")) {
    normalized = `https://www.threads.net${href}`;
  } else {
    normalized = `https://www.threads.net/${href.replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(normalized);
    parsed.hostname = "www.threads.net";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return normalized;
  }
}

function parseCount(label: string | null | undefined): number | null {
  if (label === null || label === undefined) {
    return null;
  }
  const cleaned = String(label).replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)(?:\s*([kKmM萬万千]))?/);
  if (!match) {
    return null;
  }
  let value = parseFloat(match[1]);
  const suffix = match[2] || "";
  if (/[萬万]/.test(suffix)) value *= 10000;
  else if (/千/.test(suffix)) value *= 1000;
  else if (/[kK]/.test(suffix)) value *= 1000;
  else if (/[mM]/.test(suffix)) value *= 1000000;
  return Math.round(value);
}

function cleanBodyText(rawText: string): string {
  const lines = String(rawText || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (UI_TOKENS.has(lower)) continue;
    if (/^\d+(?:\.\d+)?[km]?$/i.test(lower)) continue;
    if (/^\d+\s?[smhdw]$/i.test(lower)) continue;
    if (line === "/" || line === "·" || line === "•") continue;
    if (i < 2 && !line.includes(" ") && !TIME_TOKEN_RE.test(line)) continue;
    out.push(line);
  }

  return out.join("\n").trim();
}

function extractPostId(url: string): string {
  const match = String(url).match(/\/post\/([^/?#]+)/i);
  return match ? match[1] : "";
}

export function inferSurfaceFromLocation(url: string): TargetSurface {
  return /\/post\/[^/?#]+/i.test(url) ? "post_detail" : "feed";
}

function hasLikelyEngagementRow(card: HTMLElement): boolean {
  // Threads uses svg[aria-label] for engagement icons (Like, Reply, Repost, Share)
  const svgs = card.querySelectorAll<SVGElement>("svg[aria-label]");
  let score = 0;
  for (const svg of svgs) {
    const label = svg.getAttribute("aria-label") || "";
    if (classifyMetric(label)) {
      score += 1;
      if (score >= 2) return true;
    }
  }
  return false;
}

function isComposerLike(card: HTMLElement): boolean {
  if (card.querySelector("textarea, [contenteditable='true']")) {
    return true;
  }

  const sample = (card.innerText || card.textContent || "").slice(0, 160).toLowerCase();
  return /what'?s new\?|what’s new\?|start a thread|post to threads/.test(sample);
}

function isRecommendationLike(card: HTMLElement): boolean {
  const sample = (card.innerText || card.textContent || "").slice(0, 240).toLowerCase();
  if (/suggested for you|who to follow|profiles/.test(sample)) {
    return true;
  }

  const followButtons = Array.from(card.querySelectorAll("button, a")).filter((element) =>
    /follow/i.test((element.textContent || "").trim())
  );
  return followButtons.length >= 2 && !card.querySelector('a[href*="/post/"]');
}

function collectCandidateSignals(card: HTMLElement): CardCandidateSignals {
  const widthRatio = window.innerWidth > 0 ? card.getBoundingClientRect().width / window.innerWidth : 0;
  const permalinkCount = card.querySelectorAll('a[href*="/post/"]').length;
  const articleDescendants = card.querySelectorAll("article, div[role='article']").length;
  const nestedPermalinkCount = Array.from(card.children).reduce((count, child) => {
    if (!(child instanceof HTMLElement)) {
      return count;
    }
    return count + child.querySelectorAll('a[href*="/post/"]').length;
  }, 0);
  const isFeedShell =
    (widthRatio > 0.94 && permalinkCount > 2) ||
    (widthRatio > 0.98 && articleDescendants > 2) ||
    permalinkCount > 4 ||
    articleDescendants > 3;

  return {
    isArticleLike: card.matches("article, div[role='article']"),
    hasPermalink: permalinkCount > 0,
    isPressable: card.matches('div[data-pressable-container="true"]') || card.hasAttribute("data-pressable-container"),
    hasAuthorHint: Boolean(card.querySelector("a[href^='/@'], a[href*='threads.net/@']")),
    hasEngagementRow: hasLikelyEngagementRow(card),
    isComposer: isComposerLike(card),
    isRecommendation: isRecommendationLike(card),
    isFeedShell,
    widthRatio,
    permalinkCount,
    articleDescendants,
    nestedPermalinkCount
  };
}

export function scoreCardCandidateSignals(signals: CardCandidateSignals): number {
  if (signals.isComposer || signals.isRecommendation || signals.isFeedShell) {
    return -8;
  }

  let score = 0;
  if (signals.isArticleLike) score += 4;
  if (signals.hasPermalink) score += 4;
  if (signals.hasAuthorHint) score += 2;
  if (signals.hasEngagementRow) score += 2;
  if (signals.isPressable) score += 1;

  if (!signals.hasPermalink) score -= 1;
  if (!signals.hasAuthorHint) score -= 2;
  if (!signals.hasEngagementRow) score -= 1;
  if (signals.widthRatio > 0.82) score -= 2;
  if (signals.widthRatio > 0.9) score -= 3;
  if (signals.nestedPermalinkCount >= 1 && signals.isArticleLike && signals.hasPermalink) score += 1;

  return score;
}

export function classifyCandidateStrength(score: number): CandidateStrength | null {
  if (score >= 8) {
    return "hard";
  }
  if (score >= 2) {
    return "soft";
  }
  return null;
}

export function findCardCandidate(node: EventTarget | Node | null): CardCandidate {
  const element =
    node instanceof Element ? node : node instanceof Node ? node.parentElement : null;

  if (!element) {
    return { root: null, strength: null, score: -999 };
  }

  let current: HTMLElement | null = element as HTMLElement;
  let depth = 0;
  let best: CardCandidate = { root: null, strength: null, score: -999 };

  while (current && depth < 8) {
    const signals = collectCandidateSignals(current);
    const score = scoreCardCandidateSignals(signals);
    const strength = classifyCandidateStrength(score);
    if (strength && score > best.score) {
      best = {
        root: current,
        strength,
        score
      };
    }
    current = current.parentElement;
    depth += 1;
  }

  return best;
}

export function findCardRoot(node: EventTarget | Node | null): HTMLElement | null {
  return findCardCandidate(node).root;
}

function extractPermalink(card: HTMLElement): { permalink: string; rawText: string } {
  const rawText = (card.innerText || card.textContent || "").trim();
  const links = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"));
  let permalink = "";

  for (const link of links) {
    const text = (link.innerText || link.textContent || "").trim();
    if (TIME_TOKEN_RE.test(text)) {
      permalink = link.getAttribute("href") || "";
      break;
    }
  }

  if (!permalink && links.length) {
    const hrefs = links.map((link) => link.getAttribute("href") || "").filter(Boolean);
    const candidates = hrefs.filter((href) => href.includes("/post/"));
    permalink = candidates[candidates.length - 1] || "";
  }

  return { permalink: normalizeUrl(permalink), rawText };
}

function extractAuthorHint(card: HTMLElement): string {
  // Threads reposts have a "X reposted" header as the first /@-link.
  // The actual post author is a subsequent /@-link that is NOT inside a repost header.
  const allUserAnchors = Array.from(
    card.querySelectorAll<HTMLAnchorElement>("a[href^='/@'], a[href*='threads.net/@']")
  );

  for (const anchor of allUserAnchors) {
    // Skip if this anchor's surrounding context contains "reposted" — it's the reposter, not the author
    const parent = anchor.parentElement;
    const surroundingText = (parent?.textContent || "").trim().toLowerCase();
    if (/repost(ed)?/i.test(surroundingText) && surroundingText.length < 80) {
      continue;
    }

    const text = (anchor.textContent || "").trim();
    if (text) {
      return text.replace(/^@/, "");
    }
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/\/@([^/?#]+)/);
    if (match) return match[1];
  }

  // Fallback: return first link if nothing else matched
  if (allUserAnchors.length) {
    const text = (allUserAnchors[0].textContent || "").trim();
    if (text) return text.replace(/^@/, "");
    const href = allUserAnchors[0].getAttribute("href") || "";
    const match = href.match(/\/@([^/?#]+)/);
    return match ? match[1] : "";
  }

  return "";
}

function extractTimeTokenHint(card: HTMLElement): string {
  const rawText = (card.innerText || card.textContent || "").trim();
  const match = rawText.match(TIME_TOKEN_RE);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function buildDomAnchor(card: HTMLElement): string {
  if (card.id) {
    return `${card.tagName.toLowerCase()}#${card.id}`;
  }

  const segments: string[] = [];
  let node: HTMLElement | null = card;
  let depth = 0;
  while (node && depth < 4) {
    const currentNode: HTMLElement = node;
    let segment = currentNode.tagName.toLowerCase();
    if (currentNode.id) {
      segment += `#${currentNode.id}`;
      segments.unshift(segment);
      break;
    }
    const role = currentNode.getAttribute("role");
    if (role) {
      segment += `[role="${role}"]`;
    }
    if (currentNode.hasAttribute("data-pressable-container")) {
      segment += '[data-pressable-container="true"]';
    }
    const parent = currentNode.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child): child is Element => child instanceof Element && child.tagName === currentNode.tagName
      );
      if (siblings.length > 1) {
        segment += `:nth-of-type(${siblings.indexOf(currentNode) + 1})`;
      }
    }
    segments.unshift(segment);
    node = currentNode.parentElement;
    depth += 1;
  }

  return segments.join(" > ");
}

function classifyTargetType(card: HTMLElement, pageUrl: string, permalink: string): TargetType {
  const normalizedPage = normalizeUrl(pageUrl);
  const normalizedPermalink = normalizeUrl(permalink);
  const pagePostId = extractPostId(normalizedPage);
  const permalinkPostId = extractPostId(normalizedPermalink);

  if (normalizedPermalink && normalizedPage && normalizedPermalink === normalizedPage) {
    return "post";
  }
  if (pagePostId && permalinkPostId && pagePostId === permalinkPostId) {
    return "post";
  }
  const firstArticle = document.querySelector("article, div[role='article']");
  if (firstArticle === card) {
    return "post";
  }
  return "comment";
}

export function classifyMetric(label: string): keyof EngagementMetrics | null {
  const lower = String(label || "").toLowerCase();
  if (/\b(like|likes|liked)\b/.test(lower) || /讚|赞|喜歡|喜欢/.test(label)) return "likes";
  if (/\b(reply|replies|comment|comments)\b/.test(lower) || /回覆|回复|留言/.test(label)) return "comments";
  if (/\b(repost|reposts|reshare|re-share)\b/.test(lower) || /轉發|转发|轉貼|转贴/.test(label)) return "reposts";
  if (/\b(share|shares|send|forward)\b/.test(lower) || /分享|傳送|传送|轉寄|转寄/.test(label)) return "forwards";
  if (/\b(view|views)\b/.test(lower) || /瀏覽|浏览|次查看/.test(label)) return "views";
  return null;
}

function resolveEngagement(card: HTMLElement, targetType: TargetType): { engagement: EngagementMetrics; engagement_present: EngagementPresent } {
  const metrics: EngagementMetrics = {
    likes: null,
    comments: null,
    reposts: null,
    forwards: null,
    views: null
  };
  const present: EngagementPresent = {
    likes: false,
    comments: false,
    reposts: false,
    forwards: false,
    views: false
  };

  // Threads DOM: <svg aria-label="Like"> + <span>582</span> as sibling
  const svgs = Array.from(card.querySelectorAll<SVGElement>("svg[aria-label]"));
  for (const svg of svgs) {
    const ariaLabel = svg.getAttribute("aria-label") || "";
    const key = classifyMetric(ariaLabel);
    if (!key || present[key]) continue;

    // Count is in a sibling <span> next to the SVG
    const parent = svg.parentElement;
    const siblingSpan = parent?.querySelector("span");
    const countText = siblingSpan ? (siblingSpan.textContent || "").trim() : "";

    present[key] = true;
    metrics[key] = countText ? parseCount(countText) : null;
  }

  // Fallback: also check [aria-label] on non-SVG elements (buttons, links)
  if (!present.likes && !present.comments && !present.reposts && !present.forwards) {
    const controls = Array.from(card.querySelectorAll<HTMLElement>("button[aria-label], a[aria-label]"));
    for (const el of controls.slice(0, 20)) {
      const ariaLabel = el.getAttribute("aria-label") || "";
      const key = classifyMetric(ariaLabel);
      if (!key || present[key]) continue;

      const text = (el.textContent || "").trim();
      present[key] = true;
      metrics[key] = text.length <= 20 ? parseCount(text) : null;
    }
  }

  if (targetType === "post" && !present.views) {
    const bodyText = document.body?.innerText || document.body?.textContent || "";
    const match = bodyText.match(/(\d+(?:\.\d+)?\s*[kKmM]?)[ ]*views\b/i);
    if (match) {
      present.views = true;
      metrics.views = parseCount(match[1]);
    }
  }

  return { engagement: metrics, engagement_present: present };
}

export function buildTargetDescriptor(card: HTMLElement, pageUrl: string): TargetDescriptor | null {
  const normalizedPage = normalizeUrl(pageUrl || window.location.href || "");
  const { permalink, rawText } = extractPermalink(card);
  const targetType = classifyTargetType(card, normalizedPage, permalink);
  const cleanedText = cleanBodyText(rawText);
  const metricsResult = resolveEngagement(card, targetType);

  return {
    target_type: targetType,
    page_url: normalizedPage,
    post_url: permalink || normalizedPage,
    author_hint: extractAuthorHint(card),
    text_snippet: cleanedText.slice(0, 240),
    time_token_hint: extractTimeTokenHint(card),
    dom_anchor: buildDomAnchor(card),
    engagement: metricsResult.engagement,
    engagement_present: metricsResult.engagement_present,
    captured_at: new Date().toISOString()
  };
}

export function canSubmitDescriptor(descriptor: TargetDescriptor): boolean {
  const surface = inferSurfaceFromLocation(descriptor.page_url);
  if (surface === "feed") {
    return /\/post\/[^/?#]+/i.test(descriptor.post_url);
  }
  return Boolean(descriptor.post_url);
}
