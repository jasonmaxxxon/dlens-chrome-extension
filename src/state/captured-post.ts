import type {
  CaptureSnapshot,
  ThreadReadModelOrphanReplySnapshot,
  ThreadReadModelPostSnapshot,
  ThreadReadModelReplyEdgeSnapshot,
  ThreadReadModelSnapshot
} from "../contracts/ingest.ts";
import type { TargetDescriptor } from "../contracts/target-descriptor.ts";
import type { SessionItem, SessionItemStatus } from "./types.ts";

export type CapturedPostReplyRole = "op_continuation" | "audience" | "placeholder";
export type CapturedPostOrphanReason = "parent_not_found_in_comments_or_root";

export interface CapturedPostReplyEdge {
  commentId: string;
  parentCommentId: string;
  parentKind: "comment";
}

export interface CapturedPostOrphanReply {
  commentId: string;
  parentCommentId: string | null;
  parentSourceCommentId: string | null;
  reason: CapturedPostOrphanReason;
}

export interface CapturedPostFragment {
  id: string;
  sourceId: string | null;
  parentId: string | null;
  parentSourceId: string | null;
  author: string;
  text: string;
  timeToken: string | null;
  likes: number | null;
  replyCount: number | null;
  role: CapturedPostReplyRole;
  isOrphan: boolean;
  orphanReason?: CapturedPostOrphanReason;
  resolvedParentId: string | null;
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
  replyEdges: CapturedPostReplyEdge[];
  orphanReplies: CapturedPostOrphanReply[];
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

function readReplyEdges(model: ThreadReadModelSnapshot | null): CapturedPostReplyEdge[] {
  const edges = model?.replyEdges ?? model?.reply_edges ?? [];
  if (!Array.isArray(edges)) {
    return [];
  }
  return edges
    .map((edge: ThreadReadModelReplyEdgeSnapshot): CapturedPostReplyEdge | null => {
      const commentId = readTrimmedString(edge.commentId ?? edge.comment_id);
      const parentCommentId = readTrimmedString(edge.parentCommentId ?? edge.parent_comment_id);
      const parentKind = edge.parentKind ?? edge.parent_kind;
      if (!commentId || !parentCommentId || (parentKind && parentKind !== "comment")) {
        return null;
      }
      return { commentId, parentCommentId, parentKind: "comment" };
    })
    .filter((edge): edge is CapturedPostReplyEdge => edge !== null);
}

function readOrphanReplies(model: ThreadReadModelSnapshot | null): CapturedPostOrphanReply[] {
  const orphans = model?.orphanReplies ?? model?.orphan_replies ?? [];
  if (!Array.isArray(orphans)) {
    return [];
  }
  return orphans
    .map((orphan: ThreadReadModelOrphanReplySnapshot): CapturedPostOrphanReply | null => {
      const commentId = readTrimmedString(orphan.commentId ?? orphan.comment_id);
      if (!commentId) {
        return null;
      }
      return {
        commentId,
        parentCommentId: readTrimmedString(orphan.parentCommentId ?? orphan.parent_comment_id) || null,
        parentSourceCommentId: readTrimmedString(orphan.parentSourceCommentId ?? orphan.parent_source_comment_id) || null,
        reason: orphan.reason === "parent_not_found_in_comments_or_root"
          ? orphan.reason
          : "parent_not_found_in_comments_or_root"
      };
    })
    .filter((orphan): orphan is CapturedPostOrphanReply => orphan !== null);
}

function readAssembledContent(model: ThreadReadModelSnapshot | null): string {
  return readTextString(model?.assembledContent ?? model?.assembled_content);
}

function readPostId(post: ThreadReadModelPostSnapshot, fallbackId: string): string {
  return readTrimmedString(post.postId ?? post.post_id ?? post.commentId ?? post.comment_id) || fallbackId;
}

function readPostSourceId(post: ThreadReadModelPostSnapshot): string | null {
  return readTrimmedString(post.sourceCommentId ?? post.source_comment_id) || null;
}

function readPostParentId(post: ThreadReadModelPostSnapshot): string | null {
  return readTrimmedString(post.parentCommentId ?? post.parent_comment_id) || null;
}

function readPostParentSourceId(post: ThreadReadModelPostSnapshot): string | null {
  return readTrimmedString(post.parentSourceCommentId ?? post.parent_source_comment_id) || null;
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

function readPostReplyCount(post: ThreadReadModelPostSnapshot | null | undefined): number | null {
  return readNumberOrNull(post?.replyCount ?? post?.reply_count);
}

function readPostTimeToken(post: ThreadReadModelPostSnapshot | null | undefined): string | null {
  return readTrimmedString(post?.timeToken ?? post?.time_token) || null;
}

function readLegacyComments(capture: CaptureSnapshot | null | undefined): ThreadReadModelPostSnapshot[] {
  const comments = capture?.result?.comments ?? [];
  return Array.isArray(comments) ? comments as ThreadReadModelPostSnapshot[] : [];
}

function buildOrphanIdSet(orphanReplies: CapturedPostOrphanReply[]): Map<string, CapturedPostOrphanReply> {
  return new Map(orphanReplies.map((orphan) => [orphan.commentId, orphan]));
}

function buildResolvedParentIdSet(replyEdges: CapturedPostReplyEdge[]): Map<string, string> {
  return new Map(replyEdges.map((edge) => [edge.commentId, edge.parentCommentId]));
}

function normalizeFragment(
  post: ThreadReadModelPostSnapshot,
  fallbackId: string,
  role: CapturedPostReplyRole,
  relationships: {
    orphanById: Map<string, CapturedPostOrphanReply>;
    resolvedParentById: Map<string, string>;
  }
): CapturedPostFragment | null {
  const text = readPostText(post);
  if (!text) {
    return null;
  }
  const id = readPostId(post, fallbackId);
  const sourceId = readPostSourceId(post);
  const identityKeys = sourceId && sourceId !== id ? [id, sourceId] : [id];
  const orphan = identityKeys.map((key) => relationships.orphanById.get(key)).find((entry): entry is CapturedPostOrphanReply => Boolean(entry));
  const resolvedParentId = identityKeys.map((key) => relationships.resolvedParentById.get(key)).find((entry): entry is string => Boolean(entry)) ?? null;
  return {
    id,
    sourceId,
    parentId: readPostParentId(post),
    parentSourceId: readPostParentSourceId(post),
    author: readPostAuthor(post),
    text,
    timeToken: readPostTimeToken(post),
    likes: readPostLikes(post),
    replyCount: readPostReplyCount(post),
    role,
    isOrphan: Boolean(orphan),
    ...(orphan ? { orphanReason: orphan.reason } : {}),
    resolvedParentId
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
  const replyEdges = readReplyEdges(model);
  const orphanReplies = readOrphanReplies(model);
  const relationships = {
    orphanById: buildOrphanIdSet(orphanReplies),
    resolvedParentById: buildResolvedParentIdSet(replyEdges)
  };

  for (const [index, post] of readOpContinuations(model).entries()) {
    const fragment = normalizeFragment(post, `op_${index + 1}`, "op_continuation", relationships);
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
    const fragment = normalizeFragment(post, `reply_${index + 1}`, role, relationships);
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
    discussionReplies,
    replyEdges,
    orphanReplies
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
