import type { SessionItem } from "../state/types.ts";

export function readItemSynthesisText(item: SessionItem | undefined): string {
  const result = item?.latestCapture?.result as Record<string, unknown> | null | undefined;
  const canonicalPost = result?.canonical_post as Record<string, unknown> | undefined;
  const canonicalText = typeof canonicalPost?.text === "string" ? canonicalPost.text : "";
  return [
    item?.descriptor?.text_snippet,
    item?.latestCapture?.text_snippet,
    canonicalText,
    item?.descriptor?.author_hint
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
}
