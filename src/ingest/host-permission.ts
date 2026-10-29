const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export type IngestBaseUrlClassification =
  | { ok: true; kind: "loopback" | "remote"; normalized: string }
  | { ok: false; message: string };

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
