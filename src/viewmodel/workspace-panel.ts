import type { SessionRecord } from "../state/types";
import { buildCollectionPosts, buildWorkspaceCards } from "./collection-browser";

/** Side-panel fields only; the existing workspace projection remains unchanged. */
export function buildWorkspacePanelCards(sessions: SessionRecord[], nowMs: number) {
  return buildWorkspaceCards(sessions, nowMs).map(card => {
    const posts = buildCollectionPosts([card.session]);
    const runningCount = posts.filter(post => post.memberships.some(member => member.status === "running")).length;
    const queuedCount = posts.filter(post => !post.memberships.some(member => member.status === "running")
      && post.memberships.some(member => member.status === "queued")).length;
    const lastSavedRelative = card.lastSavedRelative?.replace(/(\d+)m$/, "$1 分").replace(/(\d+)h$/, "$1 小時").replace(/(\d+)d$/, "$1 日") ?? null;
    return { ...card, lastSavedRelative, queuedCount, runningCount, readingCount: queuedCount + runningCount };
  });
}
