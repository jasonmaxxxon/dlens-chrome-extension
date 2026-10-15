import type { InlineCardQuote } from "../viewmodel/inline-card";

/**
 * The first replies a logged-in Threads post page ships in its own HTML (`thread_items` in the
 * application/json scripts, the same source the backend crawler reads for reply edges).
 * Returns null when the page carries no thread data at all, e.g. a logged-out response.
 */
export function parseFirstReplies(html: string, postCode: string): InlineCardQuote[] | null {
  const buckets: unknown[][] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    const items = (node as { thread_items?: unknown }).thread_items;
    if (Array.isArray(items)) buckets.push(items);
    Object.values(node).forEach(visit);
  };
  for (const match of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1].trim();
    if (!raw.includes("thread_items")) continue;
    try { visit(JSON.parse(raw)); } catch { /* not JSON we can read */ }
  }
  if (!buckets.length) return null;

  type Post = { code?: string; user?: { username?: string }; caption?: { text?: string } | null; like_count?: number; text_post_app_info?: { is_reply?: boolean } };
  const posts = buckets.flat().map((item) => (item as { post?: Post } | null)?.post).filter((post): post is Post => !!post?.code);
  const opAuthor = posts.find((post) => post.code === postCode)?.user?.username ?? null;
  const seen = new Set<string>();
  const replies: InlineCardQuote[] = [];
  for (const post of posts) {
    const author = post.user?.username ?? "";
    const text = post.caption?.text?.trim() ?? "";
    // Audience replies only: the post itself and the author's own thread continuation are not reactions.
    if (post.code === postCode || seen.has(post.code!) || !post.text_post_app_info?.is_reply || !text || author === opAuthor) continue;
    seen.add(post.code!);
    replies.push({ text, author, likes: typeof post.like_count === "number" ? post.like_count : null });
  }
  return replies;
}

/** `origin` is the page's own origin: the same path on threads.net vs threads.com is cross-origin. */
export async function fetchFirstReplies(postUrl: string, origin: string, signal?: AbortSignal): Promise<InlineCardQuote[] | null> {
  const path = new URL(postUrl, origin).pathname;
  const code = path.match(/\/post\/([^/?#]+)/)?.[1];
  if (!code) return null;
  const response = await fetch(new URL(path, origin).href, { credentials: "include", signal });
  if (!response.ok) return null;
  return parseFirstReplies(await response.text(), code);
}
