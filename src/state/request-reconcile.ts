import type { PipelineEventInput, PipelineTarget } from "./pipeline-trace";

export type RequestReconcileTarget = Record<string, string | number | boolean | null | undefined>;

export interface RequestReconcileToken {
  lane: string;
  requestId: string;
  target: RequestReconcileTarget;
  targetKey: string;
}

export type RequestReconcileDecision =
  | { accepted: true }
  | {
    accepted: false;
    reason: "stale-request" | "target-mismatch";
    expectedTargetKey: string;
    currentTargetKey: string | null;
    latestRequestId: string | null;
  };

interface BeginRequestInput {
  lane: string;
  requestId: string;
  target: RequestReconcileTarget;
}

interface CompleteRequestOptions {
  currentTarget?: RequestReconcileTarget | null;
}

function normalizeLane(lane: string): string {
  return lane.trim() || "request";
}

function normalizeRequestId(requestId: string): string {
  return requestId.trim() || "request";
}

export function buildRequestReconcileTargetKey(target: RequestReconcileTarget): string {
  return Object.entries(target)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|");
}

function toPipelineTarget(target: RequestReconcileTarget): PipelineTarget {
  const pipelineTarget: PipelineTarget = {};
  if (typeof target.sessionId === "string") {
    pipelineTarget.sessionId = target.sessionId;
  }
  if (typeof target.signalId === "string") {
    pipelineTarget.signalId = target.signalId;
  }
  const itemId = typeof target.itemId === "string"
    ? target.itemId
    : typeof target.itemAId === "string"
      ? target.itemAId
      : undefined;
  if (itemId) {
    pipelineTarget.itemId = itemId;
  }
  if (typeof target.tabId === "number") {
    pipelineTarget.tabId = target.tabId;
  }
  return pipelineTarget;
}

export function createRequestReconciler() {
  const latestByLane = new Map<string, RequestReconcileToken>();

  return {
    begin(input: BeginRequestInput): RequestReconcileToken {
      const token: RequestReconcileToken = {
        lane: normalizeLane(input.lane),
        requestId: normalizeRequestId(input.requestId),
        target: { ...input.target },
        targetKey: buildRequestReconcileTargetKey(input.target)
      };
      latestByLane.set(token.lane, token);
      return token;
    },

    complete(token: RequestReconcileToken, options: CompleteRequestOptions = {}): RequestReconcileDecision {
      const latest = latestByLane.get(token.lane) ?? null;
      if (!latest || latest.requestId !== token.requestId || latest.targetKey !== token.targetKey) {
        return {
          accepted: false,
          reason: "stale-request",
          expectedTargetKey: token.targetKey,
          currentTargetKey: options.currentTarget === undefined ? null : buildRequestReconcileTargetKey(options.currentTarget ?? {}),
          latestRequestId: latest?.requestId ?? null
        };
      }

      if (options.currentTarget !== undefined) {
        const currentTargetKey = buildRequestReconcileTargetKey(options.currentTarget ?? {});
        if (currentTargetKey !== token.targetKey) {
          latestByLane.delete(token.lane);
          return {
            accepted: false,
            reason: "target-mismatch",
            expectedTargetKey: token.targetKey,
            currentTargetKey,
            latestRequestId: null
          };
        }
      }

      latestByLane.delete(token.lane);
      return { accepted: true };
    }
  };
}

export function buildReconcileIgnoredEvent(
  token: RequestReconcileToken,
  decision: RequestReconcileDecision,
  step = "reconcile.stale-result.ignore"
): PipelineEventInput {
  return {
    phase: "ui.ready",
    step,
    target: toPipelineTarget(token.target),
    result: "ok",
    requestId: token.requestId,
    detail: decision.accepted
      ? {
        lane: token.lane,
        reason: null,
        expectedTargetKey: token.targetKey,
        currentTargetKey: null,
        latestRequestId: null
      }
      : {
        lane: token.lane,
        reason: decision.reason,
        expectedTargetKey: decision.expectedTargetKey,
        currentTargetKey: decision.currentTargetKey,
        latestRequestId: decision.latestRequestId
      }
  };
}
