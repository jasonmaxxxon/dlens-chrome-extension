import type { SessionItem } from "../state/types";
import { readCommentEligibility, readThreadsPostLocator, type EligibleComment } from "./comment-eligibility";
import { clipReadingCopy, readingLabel } from "./reading-copy";

export interface ClusterReading {
  clusterKey: number;
  label: string;
  measurementLabel: string;
  /** Geometry only. Copy must use measurementLabel. */
  pct?: number;
  count: number | null;
  membership: "complete" | "limited";
  members: EligibleComment[];
  leader: EligibleComment | null;
}

const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const validShare = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const descending = (value: number | null) => value ?? -1;
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Same ordering for the fallback label, selected quote and evidence list. */
export function rankClusterMembers(members: EligibleComment[]): EligibleComment[] {
  return [...members].sort((a, b) => descending(b.likes) - descending(a.likes)
    || descending(b.replies) - descending(a.replies) || compareId(a.id, b.id)
    || a.author.localeCompare(b.author) || a.text.localeCompare(b.text));
}

/** A full membership list permits filtering; three evidence samples do not. */
export function readClusterReadings(item: SessionItem, names: Record<string, string> = {}): ClusterReading[] {
  const analysis = item.latestCapture?.analysis;
  if (!analysis) return [];
  const eligibility = readCommentEligibility(item);
  const audience = new Set(eligibility.audience.map(comment => comment.id));
  const knownRawAliases = new Set<string>();
  for (const row of item.latestCapture?.result?.comments ?? []) {
    for (const key of ["comment_id", "source_comment_id", "commentId", "sourceCommentId"]) {
      const id = str(row[key]);
      if (id) knownRawAliases.add(id);
    }
  }
  const root = item.latestCapture?.result?.canonical_post;
  for (const key of ["post_id", "source_post_code", "comment_id"]) {
    const id = str(root?.[key]);
    if (id) knownRawAliases.add(id);
  }
  for (const value of [root?.url, item.descriptor.post_url, item.descriptor.page_url]) {
    const locator = readThreadsPostLocator(value);
    if (locator) knownRawAliases.add(locator.code);
  }
  const groups = (analysis.clusters ?? []).map(cluster => {
    const rawIds = Array.isArray(cluster.member_comment_ids) ? cluster.member_comment_ids : undefined;
    let complete = Array.isArray(rawIds) && rawIds.every(id => typeof id === "string" && !!id.trim());
    if (cluster.comment_count !== undefined && (!Number.isInteger(cluster.comment_count) || cluster.comment_count < 0
      || cluster.comment_count !== rawIds?.length)) complete = false;
    const resolved = new Map<string, EligibleComment>();
    for (const id of rawIds ?? []) {
      if (typeof id !== "string" || !id.trim()) { complete = false; continue; }
      const comment = eligibility.byId.get(id.trim());
      if (comment) {
        if (audience.has(comment.id)) resolved.set(comment.id, comment);
      } else if (!knownRawAliases.has(id.trim())) complete = false;
    }
    return { cluster, complete, rawCount: rawIds?.length ?? 0, members: rankClusterMembers([...resolved.values()]) };
  });
  const ownership = new Map<string, number>();
  for (const group of groups) for (const member of group.members) ownership.set(member.id, (ownership.get(member.id) ?? 0) + 1);
  for (const group of groups) if (group.members.some(member => (ownership.get(member.id) ?? 0) > 1)) group.complete = false;
  const denominator = analysis.source_comment_count;
  const compatible = typeof denominator === "number" && Number.isInteger(denominator) && denominator > 0
    && denominator === eligibility.audience.length && groups.every(group => group.complete && group.rawCount === group.members.length
      && validShare(group.cluster.size_share) && Math.abs(group.cluster.size_share - group.members.length / denominator) <= 0.005)
    && ownership.size === denominator && [...ownership.values()].every(count => count === 1);
  return groups.map(({ cluster, complete, members }) => {
    // B3's top ID is useful only when complete membership independently agrees.
    const hint = eligibility.byId.get(cluster.top_comment_id ?? "");
    const leader = complete ? (hint && hint.id === members[0]?.id ? hint : members[0] ?? null) : null;
    const count = complete ? members.length : null;
    const aiName = readingLabel(names[String(cluster.cluster_key)], 48);
    const label = aiName || (leader ? clipReadingCopy(leader.text, 80) || "代表原句見留言" : "")
      || (complete ? "未有可用觀眾原句" : "分群資料未完整");
    const pct = compatible ? Math.round(cluster.size_share * 100) : undefined;
    const measurementLabel = count === null ? "未能確認則數" : count < 15 ? `約 ${count} 則`
      : pct === undefined ? `約 ${count} 則` : `${pct}%`;
    return { clusterKey: cluster.cluster_key, label, measurementLabel, ...(pct === undefined ? {} : { pct }),
      count, membership: complete ? "complete" as const : "limited" as const,
      members: complete ? members : [], leader };
  }).sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.clusterKey - b.clusterKey);
}
