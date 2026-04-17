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
