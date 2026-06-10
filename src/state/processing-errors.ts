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

  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 120 ? `處理失敗：${cleaned.slice(0, 117)}...` : `處理失敗：${cleaned}`;
}
