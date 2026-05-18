export async function queueItemsSequential<TSnapshot>({
  initialSnapshot,
  itemIds,
  queueOne
}: {
  initialSnapshot: TSnapshot;
  itemIds: string[];
  queueOne: (itemId: string) => Promise<TSnapshot>;
}): Promise<{ snapshot: TSnapshot; queuedItemIds: string[]; failedItemIds: string[] }> {
  let snapshot = initialSnapshot;
  const queuedItemIds: string[] = [];
  const failedItemIds: string[] = [];

  for (const itemId of itemIds) {
    try {
      snapshot = await queueOne(itemId);
      queuedItemIds.push(itemId);
    } catch (error) {
      console.error("queueItemsSequential: failed", itemId, error);
      failedItemIds.push(itemId);
    }
  }

  return { snapshot, queuedItemIds, failedItemIds };
}
