export type LoadState = "loading" | "ready" | "empty" | "error" | "recovering";

export function deriveLoadState({
  isLoading = false,
  hasData = false,
  hasError = false,
  isRecovering = false
}: {
  isLoading?: boolean;
  hasData?: boolean;
  hasError?: boolean;
  isRecovering?: boolean;
}): LoadState {
  if (isRecovering) return "recovering";
  if (hasError) return "error";
  if (isLoading && !hasData) return "loading";
  if (hasData) return "ready";
  return "empty";
}

export function deriveProductSignalLoadState({
  isHydrating,
  signalCount,
  analysisCount,
  hasError
}: {
  isHydrating: boolean;
  signalCount: number;
  analysisCount: number;
  hasError: boolean;
}): LoadState {
  const hasSourceSignals = signalCount > 0;
  const hasAnalyses = analysisCount > 0;
  return deriveLoadState({
    isLoading: isHydrating && !hasAnalyses,
    hasData: hasSourceSignals && hasAnalyses,
    hasError,
    isRecovering: !hasError && !hasSourceSignals && hasAnalyses
  });
}

export function deriveTopicLoadState({
  isHydrating,
  topicCount,
  signalCount,
  hasError
}: {
  isHydrating: boolean;
  topicCount: number;
  signalCount: number;
  hasError: boolean;
}): LoadState {
  const hasTopicData = topicCount > 0 || signalCount > 0;
  return deriveLoadState({
    isLoading: isHydrating,
    hasData: hasTopicData,
    hasError: hasError && !hasTopicData,
    isRecovering: hasError && hasTopicData
  });
}
