export function buildRefreshFailureMessage(itemLabel: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Refresh failed for ${itemLabel}: ${detail}`;
}
