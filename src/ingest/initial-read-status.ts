export type InitialReadStatus =
  | "ok"
  | "lag_tolerated"
  | "route_error"
  | "version_mismatch"
  | "backend_unavailable";

export interface InitialReadContext {
  secondsSinceQueueSubmission?: number;
}

const READ_AFTER_WRITE_LAG_TOLERANCE_SECONDS = 2;

export function classifyInitialReadError(error: unknown, context: InitialReadContext = {}): InitialReadStatus {
  if (error == null) {
    return "ok";
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/Optional ingest backend unavailable/i.test(message)) {
    return "backend_unavailable";
  }

  if (error instanceof TypeError) {
    return "version_mismatch";
  }

  if (/\b422\b|Unprocessable Entity/i.test(message)) {
    return "version_mismatch";
  }

  if (/\b40(4|5)\b|Not Found|Method Not Allowed/i.test(message)) {
    const lag = context.secondsSinceQueueSubmission;
    if (typeof lag === "number" && lag >= 0 && lag <= READ_AFTER_WRITE_LAG_TOLERANCE_SECONDS) {
      return "lag_tolerated";
    }
    return "route_error";
  }

  return "backend_unavailable";
}
