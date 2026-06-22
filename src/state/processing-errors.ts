export function getProcessingFailureMessage(error: string | null | undefined): string {
  const message = String(error || "").trim();
  if (!message) {
    return "Processing failed.";
  }

  if (/Optional ingest backend unavailable/i.test(message)) {
    return "Backend unavailable. Check Settings > backend URL or start the ingest backend.";
  }

  if (/404\b.*\/worker\/drain|\/worker\/drain.*404/i.test(message)) {
    return "Worker endpoint unavailable. Check the backend URL and worker routes.";
  }

  if (/already running/i.test(message)) {
    return "Processing is already running.";
  }

  if (isPlaywrightSetupError(message)) {
    return "Backend browser setup is missing. Run Playwright browser install in ingest-core and retry.";
  }

  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

export function getProcessingFailureUiMessage(error: string | null | undefined): string {
  const message = String(error || "").trim();
  if (!message) {
    return "處理失敗。請稍後再試。";
  }

  if (/Optional ingest backend unavailable/i.test(message)) {
    return "Backend 無法連線。請到設定確認 backend URL，或先啟動 ingest backend。";
  }

  if (/404\b.*\/worker\/drain|\/worker\/drain.*404/i.test(message)) {
    return "Worker endpoint 無法使用。請確認 backend URL 與 worker routes。";
  }

  if (/already running/i.test(message)) {
    return "Backend 正在處理中，稍後會同步狀態。";
  }

  if (/500\b|Internal Server Error/i.test(message)) {
    return "Backend 回傳錯誤。請查看 backend log 後再重試。";
  }

  if (isPlaywrightSetupError(message)) {
    return "後端瀏覽器設定有問題。請在 ingest-core 安裝 Playwright Chromium 後再重試。";
  }

  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 120 ? `處理失敗：${cleaned.slice(0, 117)}...` : `處理失敗：${cleaned}`;
}

export type ProcessingErrorClass =
  | "crawler_setup_error"
  | "crawler_auth_error"
  | "invalid_target"
  | "normalization_contract_error"
  | "analysis_failed"
  | "max_attempts_exceeded"
  | "retryable_runtime_error"
  | "unexpected_runtime_error";

export interface ProcessingErrorView {
  errorClass: ProcessingErrorClass;
  isTerminal: boolean;
  label: string;
  detail: string;
  aggregateTitle: (count: number) => string;
  aggregateDetail: string;
}

interface ProcessingErrorInput {
  lastErrorKind?: string | null;
  lastError?: string | null;
}

function isPlaywrightSetupError(message: string | null | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return (
    (normalized.includes("browsertype.launch") && normalized.includes("executable doesn't exist"))
    || normalized.includes("playwright install")
    || normalized.includes("playwright was just installed or updated")
  );
}

function normalizeErrorClass(input: ProcessingErrorInput): ProcessingErrorClass | null {
  const kind = input.lastErrorKind?.trim();
  if (kind === "crawler_setup_error" || isPlaywrightSetupError(input.lastError)) {
    return "crawler_setup_error";
  }
  if (
    kind === "crawler_auth_error"
    || kind === "invalid_target"
    || kind === "normalization_contract_error"
    || kind === "analysis_failed"
    || kind === "max_attempts_exceeded"
    || kind === "retryable_runtime_error"
    || kind === "unexpected_runtime_error"
  ) {
    return kind;
  }
  return input.lastError ? "unexpected_runtime_error" : null;
}

export function describeProcessingError(input: ProcessingErrorInput): ProcessingErrorView | null {
  const errorClass = normalizeErrorClass(input);
  if (!errorClass) {
    return null;
  }

  switch (errorClass) {
    case "crawler_setup_error":
      return {
        errorClass,
        isTerminal: true,
        label: "抓取失敗",
        detail: "後端瀏覽器設定有問題。請在 ingest-core 安裝 Playwright Chromium 後再重試。",
        aggregateTitle: (count) => `${count} 個 signal 因後端瀏覽器設定失敗`,
        aggregateDetail: "已暫停自動重試。請在 ingest-core 執行 playwright install chromium 後重新分析。"
      };
    case "crawler_auth_error":
      return {
        errorClass,
        isTerminal: true,
        label: "抓取失敗",
        detail: "後端 Threads 登入設定失效。請更新 auth_threads.json 後再重試。",
        aggregateTitle: (count) => `${count} 個 signal 因 Threads 登入設定失敗`,
        aggregateDetail: "已暫停自動重試。請更新後端 auth_threads.json 後重新分析。"
      };
    case "invalid_target":
      return {
        errorClass,
        isTerminal: true,
        label: "抓取失敗",
        detail: "這個 Threads 目標連結無法抓取，請確認來源貼文仍可開啟。",
        aggregateTitle: (count) => `${count} 個 signal 的 Threads 目標無法抓取`,
        aggregateDetail: "請確認原始貼文連結仍有效，再重新分析。"
      };
    case "normalization_contract_error":
      return {
        errorClass,
        isTerminal: true,
        label: "抓取失敗",
        detail: "後端抓取結果格式不符合合約，需要修正 crawler/normalizer 後再重試。",
        aggregateTitle: (count) => `${count} 個 signal 因後端資料格式失敗`,
        aggregateDetail: "已暫停自動重試。請修正 crawler/normalizer contract 後重新分析。"
      };
    case "analysis_failed":
      return {
        errorClass,
        isTerminal: true,
        label: "分析失敗",
        detail: "抓取已完成，但後端分析失敗。請重新分析或查看後端記錄。",
        aggregateTitle: (count) => `${count} 個 signal 的後端分析失敗`,
        aggregateDetail: "請重新分析，或查看後端分析 worker 記錄。"
      };
    case "max_attempts_exceeded":
      return {
        errorClass,
        isTerminal: true,
        label: "抓取失敗",
        detail: "後端已達重試上限。請確認來源狀態後重新分析。",
        aggregateTitle: (count) => `${count} 個 signal 已達重試上限`,
        aggregateDetail: "已停止自動重試。請確認來源狀態後重新分析。"
      };
    case "retryable_runtime_error":
    case "unexpected_runtime_error":
    default:
      return {
        errorClass,
        isTerminal: false,
        label: "抓取中（重試中）",
        detail: "後端暫時回報抓取失敗，會依排程重試。",
        aggregateTitle: (count) => `${count} 個 signal 正在等待後端重試`,
        aggregateDetail: "這類錯誤可能是暫時性網路或遠端限制；系統會依排程重試。"
      };
  }
}
