function collectErrorText(error: unknown): string[] {
  if (error instanceof Error) {
    return [error.message, error.stack || ""];
  }
  if (typeof error === "string") {
    return [error];
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return Object.values(record).map((value) => String(value || ""));
  }
  return [];
}

export function isExtensionRuntimeError(error: unknown, extensionOrigin: string): boolean {
  return collectErrorText(error).some((value) => value.includes(extensionOrigin));
}

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildWorkspaceCrashMarkup(message: string): string {
  const safeMessage = escapeHtml(message);
  return `
    <div data-dlens-control="true" style="position:fixed;right:24px;top:24px;z-index:2147483640;display:grid;gap:10px;width:320px;">
      <div style="justify-self:end;width:48px;height:48px;border-radius:16px;border:1px solid rgba(99,102,241,0.18);background:linear-gradient(135deg, #4f46e5, #6366f1);box-shadow:0 8px 24px rgba(79,70,229,0.18);display:grid;place-items:center;color:#fff;font-size:20px;font-weight:700;">!</div>
      <div style="padding:16px;border-radius:18px;border:1px solid rgba(15,23,42,0.12);background:#f4f4f5;box-shadow:0 18px 52px rgba(15,23,42,0.14);color:#172033;font-family:Inter, system-ui, -apple-system, sans-serif;display:grid;gap:8px;">
        <div style="font-size:16px;font-weight:800;line-height:1.3;">DLens hit a render error.</div>
        <div style="font-size:12px;line-height:1.6;color:#4b5563;">${safeMessage}</div>
        <div style="font-size:11px;line-height:1.6;color:#7c8798;">Open the page console or reload the tab. The extension should no longer disappear silently.</div>
      </div>
    </div>
  `.trim();
}
