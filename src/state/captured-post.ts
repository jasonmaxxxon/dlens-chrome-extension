import type {
  CaptureSnapshot,
  ThreadReadModelPostSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type { SessionItem, SessionItemStatus } from "./types.ts";

export type CapturedPostReplyRole = "op_continuation" | "audience" | "placeholder";

export interface CapturedPostFragment {
  id: string;
  author: string;
  text: string;
  likes: number | null;
  role: CapturedPostReplyRole;
}

export interface CapturedPostProjection {
  author: string;
  text: string;
  sourceUrl: string;
  likes: number | null;
  commentCount: number | null;
  assembledContent: string;
  hasAssembledContent: boolean;
  hasThreadReadModel: boolean;
  opContinuations: CapturedPostFragment[];
  replies: CapturedPostFragment[];
  discussionReplies: CapturedPostFragment[];
}

interface CapturedPostSourceInput {
  capture?: CaptureSnapshot | null;
  descriptor?: TargetDescriptor | null;
  itemStatus?: SessionItemStatus | null;
  canonicalTargetUrl?: string | null;
}

interface CapturedPostProjectionOptions {
  includeLegacyComments?: boolean;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readTextString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readThreadReadModel(capture: CaptureSnapshot | null | undefined): ThreadReadModelSnapshot | null {
  const result = capture?.result;
  return result?.threadReadModel ?? result?.thread_read_model ?? null;
}

function readRootPost(model: ThreadReadModelSnapshot | null): ThreadReadModelPostSnapshot | null {
  return model?.rootPost ?? model?.root_post ?? null;
}

function readOpContinuations(model: ThreadReadModelSnapshot | null): ThreadReadModelPostSnapshot[] {
  const posts = model?.opContinuations ?? model?.op_continuations ?? [];
  return Array.isArray(posts) ? posts : [];
}

function readDiscussionReplies(model: ThreadReadModelSnapshot | null): ThreadReadModelPostSnapshot[] {
  const posts = model?.discussionReplies ?? model?.discussion_replies ?? [];
  return Array.isArray(posts) ? posts : [];
}

function readAssembledContent(model: ThreadReadModelSnapshot | null): string {
  return readTextString(model?.assembledContent ?? model?.assembled_content);
}

function readPostId(post: ThreadReadModelPostSnapshot, fallbackId: string): string {
  return readTrimmedString(post.postId ?? post.post_id ?? post.commentId ?? post.comment_id) || fallbackId;
}

function readPostText(post: ThreadReadModelPostSnapshot | null | undefined): string {
  return readTextString(post?.text);
}

function readPostAuthor(post: ThreadReadModelPostSnapshot | null | undefined): string {
  return readTrimmedString(post?.author);
}

function readPostLikes(post: ThreadReadModelPostSnapshot | null | undefined): number | null {
  return readNumberOrNull(post?.likeCount ?? post?.like_count);
}

function readLegacyComments(capture: CaptureSnapshot | null | undefined): ThreadReadModelPostSnapshot[] {
  const comments = capture?.result?.comments ?? [];
  return Array.isArray(comments) ? comments as ThreadReadModelPostSnapshot[] : [];
}

function normalizeFragment(
  post: ThreadReadModelPostSnapshot,
  fallbackId: string,
  role: CapturedPostReplyRole
): CapturedPostFragment | null {
  const text = readPostText(post);
  if (!text) {
    return null;
  }
  return {
    id: readPostId(post, fallbackId),
    author: readPostAuthor(post),
    text,
    likes: readPostLikes(post),
    role
  };
}

function resolveSourceUrl(input: CapturedPostSourceInput): string {
  return readTrimmedString(input.capture?.source_post_url)
    || readTrimmedString(input.capture?.canonical_target_url)
    || readTrimmedString(input.canonicalTargetUrl)
    || readTrimmedString(input.descriptor?.post_url);
}

function resolveCommentCount(input: CapturedPostSourceInput): number | null {
  const isSucceeded = input.itemStatus
    ? input.itemStatus === "succeeded"
    : input.capture?.ingestion_status === "succeeded";
  if (!isSucceeded) {
    return null;
  }
  const analysisCount = readNumberOrNull(input.capture?.analysis?.source_comment_count);
  if (analysisCount !== null) {
    return analysisCount;
  }
  return readNumberOrNull(input.descriptor?.engagement.comments);
}

export function projectCapturedPostFromSources(
  input: CapturedPostSourceInput,
  options: CapturedPostProjectionOptions = {}
): CapturedPostProjection {
  const model = readThreadReadModel(input.capture);
  const rootPost = readRootPost(model);
  const author = readPostAuthor(rootPost)
    || readTrimmedString(input.capture?.author_hint)
    || readTrimmedString(input.descriptor?.author_hint);
  const text = readPostText(rootPost)
    || readTextString(input.capture?.text_snippet)
    || readTextString(input.descriptor?.text_snippet);
  const assembledContent = readAssembledContent(model);
  const normalizedAuthor = author.toLowerCase();
  const opContinuations: CapturedPostFragment[] = [];
  const replies: CapturedPostFragment[] = [];
  const discussionReplies: CapturedPostFragment[] = [];

  for (const [index, post] of readOpContinuations(model).entries()) {
    const fragment = normalizeFragment(post, `op_${index + 1}`, "op_continuation");
    if (fragment) {
      opContinuations.push(fragment);
    }
  }

  const discussionPosts = readDiscussionReplies(model);
  const legacyComments = options.includeLegacyComments && !model
    ? readLegacyComments(input.capture)
    : [];

  for (const [index, post] of [...discussionPosts, ...legacyComments].entries()) {
    const postAuthor = readPostAuthor(post);
    const role: CapturedPostReplyRole = !postAuthor
      ? "placeholder"
      : postAuthor.toLowerCase() === normalizedAuthor
        ? "op_continuation"
        : "audience";
    const fragment = normalizeFragment(post, `reply_${index + 1}`, role);
    if (!fragment) {
      continue;
    }
    discussionReplies.push(fragment);
    if (fragment.role === "op_continuation") {
      opContinuations.push(fragment);
    } else {
      replies.push(fragment);
    }
  }

  return {
    author,
    text,
    sourceUrl: resolveSourceUrl(input),
    likes: readPostLikes(rootPost) ?? readNumberOrNull(input.descriptor?.engagement.likes),
    commentCount: resolveCommentCount(input),
    assembledContent,
    hasAssembledContent: Boolean(assembledContent),
    hasThreadReadModel: Boolean(model),
    opContinuations,
    replies,
    discussionReplies
  };
}

export function projectCapturedPostFromCapture(
  capture: CaptureSnapshot | null | undefined,
  options: CapturedPostProjectionOptions = {}
): CapturedPostProjection {
  return projectCapturedPostFromSources({ capture }, options);
}

export function projectCapturedPost(item: SessionItem): CapturedPostProjection {
  return projectCapturedPostFromSources({
    capture: item.latestCapture,
    descriptor: item.descriptor,
    itemStatus: item.status,
    canonicalTargetUrl: item.canonicalTargetUrl
  });
}
