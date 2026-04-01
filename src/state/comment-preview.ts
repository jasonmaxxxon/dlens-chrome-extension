import type { CaptureSnapshot } from "../contracts/ingest";
import type { CommentPreview } from "./types";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = asString(record[key]);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function getCommentText(record: Record<string, unknown>): string {
  return pickFirstString(record, [
    "text",
    "body",
    "snippet",
    "content",
    "comment_text",
    "commentText",
    "message"
  ]);
}

function getCommentAuthor(record: Record<string, unknown>): string {
  const nestedAuthor = record.author;
  if (nestedAuthor && typeof nestedAuthor === "object") {
    const nested = nestedAuthor as Record<string, unknown>;
    return pickFirstString(nested, ["username", "handle", "name", "display_name"]);
  }
  return pickFirstString(record, [
    "author_username",
    "author",
    "username",
    "handle",
    "name",
    "display_name"
  ]);
}

function getCommentId(record: Record<string, unknown>, index: number): string {
  return pickFirstString(record, ["id", "comment_id", "commentId"]) || `comment-${index}`;
}

function getCommentLikeCount(record: Record<string, unknown>): number | null {
  return asNumber(
    record.like_count ?? record.likeCount ?? record.likes ?? record.favorites ?? record.favorite_count
  );
}

export function extractCommentsPreview(capture: CaptureSnapshot | null | undefined, limit = 5): CommentPreview[] {
  const comments = capture?.result?.comments;
  if (!Array.isArray(comments)) {
    return [];
  }

  const normalized = comments
    .map((comment, index) => {
      if (!comment || typeof comment !== "object") {
        return null;
      }

      const record = comment as Record<string, unknown>;
      const text = getCommentText(record);
      if (!text) {
        return null;
      }

      return {
        id: getCommentId(record, index),
        author: getCommentAuthor(record),
        text,
        likeCount: getCommentLikeCount(record),
        originalIndex: index
      };
    })
    .filter((value): value is CommentPreview & { originalIndex: number } => Boolean(value));

  normalized.sort((left, right) => {
    const leftLikes = left.likeCount ?? Number.NEGATIVE_INFINITY;
    const rightLikes = right.likeCount ?? Number.NEGATIVE_INFINITY;
    if (leftLikes !== rightLikes) {
      return rightLikes - leftLikes;
    }
    return left.originalIndex - right.originalIndex;
  });

  return normalized.slice(0, limit).map(({ originalIndex: _originalIndex, ...comment }) => comment);
}
