/** Why one item could not be queued. `retryAfter` is set when the backend refused it until a time (post cooldown). */
export interface QueueFailureReason {
  message: string;
  retryAfter: string | null;
}

export async function queueItemsSequential<TSnapshot>({
  initialSnapshot,
  itemIds,
  queueOne
}: {
  initialSnapshot: TSnapshot;
  itemIds: string[];
  queueOne: (itemId: string) => Promise<TSnapshot>;
}): Promise<{ snapshot: TSnapshot; queuedItemIds: string[]; failedItemIds: string[]; failureReasons: Record<string, QueueFailureReason> }> {
  let snapshot = initialSnapshot;
  const queuedItemIds: string[] = [];
  const failedItemIds: string[] = [];
  const failureReasons: Record<string, QueueFailureReason> = {};

  for (const itemId of itemIds) {
    try {
      snapshot = await queueOne(itemId);
      queuedItemIds.push(itemId);
    } catch (error) {
      console.error("queueItemsSequential: failed", itemId, error);
      failedItemIds.push(itemId);
      const retryAfter = (error as { retryAfter?: unknown } | null)?.retryAfter;
      failureReasons[itemId] = {
        message: error instanceof Error ? error.message : String(error),
        retryAfter: typeof retryAfter === "string" ? retryAfter : null
      };
    }
  }

  return { snapshot, queuedItemIds, failedItemIds, failureReasons };
}
