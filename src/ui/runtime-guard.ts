export function getWorkspaceCrashMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const candidate = [record.reason, record.message, record.error]
      .map((value) => String(value || "").trim())
      .find(Boolean);
    if (candidate) {
      return candidate;
    }
  }
  return "Unknown extension render error";
}
