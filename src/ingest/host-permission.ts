const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Shown when Chrome has not granted the saved remote ingest origin. */
export const INGEST_ORIGIN_DENIED_MESSAGE = "未授權連線到這個後端";

export type IngestBaseUrlClassification =
  | { ok: true; kind: "loopback" | "remote"; normalized: string }
  | { ok: false; message: string };

export type IngestPermissionDecision =
  | { ok: true; normalized: string; requestedOrigins: string[] }
  | { ok: false; message: string; requestedOrigins: string[] };

interface OriginPermissionQuery {
  origins?: string[];
}

interface ChromeOriginPermissions {
  request?: (permissions: OriginPermissionQuery) => Promise<boolean>;
  contains?: (permissions: OriginPermissionQuery) => Promise<boolean>;
}

/**
 * Canonical http(s) origin for the ingest base URL. Empty input stays on the
 * local default. Credentials, paths, and non-http schemes are rejected so a
 * token cannot be smuggled into the URL.
 */
export function classifyIngestBaseUrl(raw: string): IngestBaseUrlClassification {
  const trimmed = String(raw || "").trim();
  const candidate = trimmed.replace(/\/+$/, "") || "http://127.0.0.1:8000";
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: "Ingest 網址要是 http 或 https，例如 http://127.0.0.1:8000。" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Ingest 網址只接受 http 或 https。" };
  }
  if (url.username || url.password) {
    return { ok: false, message: "API token 請填在下方欄位，不要寫進網址。" };
  }
  if (url.search || url.hash || (url.pathname && url.pathname !== "/")) {
    return { ok: false, message: "Ingest 網址只需要協定、主機和埠，例如 http://127.0.0.1:8000。" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const kind = LOOPBACK_HOSTS.has(host) ? "loopback" : "remote";
  return { ok: true, kind, normalized: `${url.protocol}//${url.host}` };
}

/** Match pattern for one typed origin, including its port. Null for loopback, which is a required host permission. */
export function remoteIngestOriginPattern(raw: string): string | null {
  const classified = classifyIngestBaseUrl(raw);
  if (!classified.ok || classified.kind === "loopback") return null;
  return `${classified.normalized}/*`;
}

function chromeOriginPermissions(): ChromeOriginPermissions | null {
  const chromeObject = (globalThis as { chrome?: { permissions?: ChromeOriginPermissions } }).chrome;
  return chromeObject?.permissions ?? null;
}

function chromeGlobalIsPresent(): boolean {
  return typeof (globalThis as { chrome?: unknown }).chrome !== "undefined";
}

function denied(origin: string, requestedOrigins: string[], suffix = ""): Extract<IngestPermissionDecision, { ok: false }> {
  return {
    ok: false,
    message: `${INGEST_ORIGIN_DENIED_MESSAGE}（${origin}）${suffix}`,
    requestedOrigins
  };
}

/**
 * Ask Chrome for the single origin the user typed. Call this synchronously from
 * the settings click handler, before any await, so the user gesture is still active.
 * Loopback is already in required host_permissions and is not requested.
 */
export function startIngestOriginPermissionRequest(rawBaseUrl: string): Promise<IngestPermissionDecision> {
  const classified = classifyIngestBaseUrl(rawBaseUrl);
  if (!classified.ok) {
    return Promise.resolve({ ok: false, message: classified.message, requestedOrigins: [] });
  }
  if (classified.kind === "loopback") {
    return Promise.resolve({ ok: true, normalized: classified.normalized, requestedOrigins: [] });
  }
  const originPattern = `${classified.normalized}/*`;
  const request = chromeOriginPermissions()?.request;
  if (!request) {
    return Promise.resolve(denied(classified.normalized, [originPattern], "。設定未儲存。"));
  }
  let pending: Promise<boolean>;
  try {
    pending = request({ origins: [originPattern] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Promise.resolve({ ok: false, message, requestedOrigins: [originPattern] });
  }
  return pending.then(
    (granted) => granted
      ? { ok: true, normalized: classified.normalized, requestedOrigins: [originPattern] }
      : denied(classified.normalized, [originPattern], "。設定未儲存。"),
    (error: unknown) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : String(error),
      requestedOrigins: [originPattern]
    })
  );
}

/** Runs `save` only after Chrome grants the typed origin. A denial does not call `save`. */
export async function saveIngestSettingsIfPermitted<T>(
  rawBaseUrl: string,
  pendingPermission: Promise<IngestPermissionDecision> | undefined,
  save: (normalizedBaseUrl: string) => Promise<T>
): Promise<{ ok: true; value: T; normalized: string } | { ok: false; message: string }> {
  const decision = await (pendingPermission ?? startIngestOriginPermissionRequest(rawBaseUrl));
  if (!decision.ok) return { ok: false, message: decision.message };
  return { ok: true, normalized: decision.normalized, value: await save(decision.normalized) };
}

/**
 * Service-worker gate for a concrete ingest request URL. Loopback is covered by
 * required host_permissions. A remote origin must already have been granted;
 * otherwise the caller sees an explicit denial instead of a generic fetch error.
 */
export async function assertRemoteIngestOriginGranted(requestUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return;
  const origin = `${url.protocol}//${url.host}`;
  const pattern = `${origin}/*`;
  if (!chromeGlobalIsPresent()) return;
  const contains = chromeOriginPermissions()?.contains;
  const allowed = typeof contains === "function" ? await contains({ origins: [pattern] }) : false;
  if (!allowed) {
    throw new Error(denied(origin, [pattern]).message);
  }
}
