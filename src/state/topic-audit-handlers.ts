import type { AuditPromptEnvelope } from "../compare/topic-audit-prompts.ts";
import {
  TOPIC_AUDIT_PROMPT_VERSIONS,
  buildP1SignalReadingPrompt,
  buildP2LexiconPrompt,
  buildP3NarrativePrompt,
  buildP4AudiencePrompt,
  buildP5AbsencePrompt,
  buildP6FinalReportPrompt,
  buildP8CrossTopicCalibrationPrompt
} from "../compare/topic-audit-prompts.ts";
import {
  buildTopicEvidencePackets,
  type CrossTopicCalibration,
  type EvidencePacket,
  type LensMemo,
  type SignalReading,
  type TopicAuditReport,
  type TopicAuditStageName
} from "../compare/topic-audit.ts";
import {
  TOPIC_AUDIT_EVIDENCE_STORAGE_KEY,
  TOPIC_AUDIT_MEMOS_STORAGE_KEY,
  TOPIC_AUDIT_REPORTS_STORAGE_KEY,
  buildTopicAuditCacheKey,
  loadTopicAuditEvidence,
  loadTopicAuditMemos,
  loadTopicAuditReport,
  saveCrossTopicCalibration,
  saveTopicAuditEvidence,
  saveTopicAuditMemos,
  saveTopicAuditReport,
  type StorageAreaLike,
  type TopicAuditMemoBundle
} from "./topic-audit-storage.ts";
import { buildSignalReadinessById } from "./signal-readiness.ts";
import { loadSignals, loadTopics } from "./topic-storage.ts";
import { listSignalTags } from "../compare/signal-tags-storage.ts";
import { validateCrossTopicCalibrationDraft, validateTopicAuditDraft, type TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { SessionRecord, SessionItem, Signal, Topic } from "./types.ts";

export type TopicAuditHandlerMessage =
  | { type: "topic/audit/build-evidence"; sessionId: string; topicId: string }
  | { type: "topic/audit/run"; sessionId: string; topicId: string; fromStage?: TopicAuditStageName }
  | { type: "topic/audit/p1-signal"; sessionId: string; topicId: string; signalId: string }
  | { type: "topic/audit/get"; topicId: string }
  | { type: "topic/audit/validate"; topicId: string }
  | { type: "topic/audit/clear"; topicId: string }
  | { type: "cross-topic/calibrate"; topicIds: string[] };

export interface TopicAuditHandlerResult {
  auditEvidence?: EvidencePacket[];
  auditReport?: TopicAuditReport | null;
  auditMemos?: TopicAuditMemoBundle | null;
  auditValidatorFlags?: TopicAuditValidationFlag[];
  crossTopicCalibration?: CrossTopicCalibration | null;
}

export interface TopicAuditHandlerOptions {
  message: TopicAuditHandlerMessage;
  sessions: SessionRecord[];
  generateEnvelope?: (stageName: TopicAuditStageName, prompt: string) => Promise<AuditPromptEnvelope>;
  model?: string;
  now?: () => string;
}

function nowIso(options: TopicAuditHandlerOptions): string {
  return options.now?.() ?? new Date().toISOString();
}

function findSession(sessions: SessionRecord[], sessionId: string): SessionRecord {
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new Error("Folder not found");
  }
  return session;
}

async function findTopic(storageArea: StorageAreaLike, sessionId: string, topicId: string): Promise<Topic> {
  const topic = (await loadTopics(storageArea, sessionId)).find((entry) => entry.id === topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }
  return topic;
}

function itemStatesForTopic(topic: Topic, signals: Signal[], itemsById: Map<string, SessionItem>) {
  return topic.signalIds.flatMap((signalId) => {
    const signal = signals.find((entry) => entry.id === signalId);
    const item = signal?.itemId ? itemsById.get(signal.itemId) : null;
    if (!signal || !item) {
      return [];
    }
    return [{
      itemId: item.id,
      updatedAt: item.latestCapture?.updated_at ?? item.lastStatusAt ?? item.savedAt,
      status: item.status
    }];
  });
}

function buildInputHash(topic: Topic, signals: Signal[], itemsById: Map<string, SessionItem>): string {
  return buildTopicAuditCacheKey({
    topicId: topic.id,
    signalIds: topic.signalIds,
    itemStates: itemStatesForTopic(topic, signals, itemsById),
    promptVersion: Object.values(TOPIC_AUDIT_PROMPT_VERSIONS).join("|"),
    stageName: "all"
  });
}

function auditReadySignalIds(session: SessionRecord, signals: Signal[]): Set<string> {
  const readinessById = buildSignalReadinessById(session, signals);
  return new Set(
    Object.entries(readinessById)
      .filter(([, readiness]) => readiness.status === "ready")
      .map(([signalId]) => signalId)
  );
}

async function buildAndSaveEvidence(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  auditRunId: string,
  inputHash: string
): Promise<EvidencePacket[]> {
  const signals = await loadSignals(storageArea, session.id);
  const itemIds = Array.from(new Set(signals.map((signal) => signal.itemId).filter((itemId): itemId is string => Boolean(itemId))));
  const signalTags = await listSignalTags(storageArea, itemIds);
  const signalTagsByItemId = Object.fromEntries(signalTags.map((record) => [record.itemId, record]));
  const packets = buildTopicEvidencePackets({
    topic,
    signals,
    items: session.items,
    signalTagsByItemId,
    auditRunId,
    inputHash
  });
  await saveTopicAuditEvidence(storageArea, topic.id, packets);
  return packets;
}

function allAllowedRefs(packets: EvidencePacket[]): Set<string> {
  const refs = new Set<string>();
  for (const packet of packets) {
    refs.add(`${packet.shortCode}.OP`);
    for (const fragment of packet.replyFragments) {
      refs.add(fragment.ref);
    }
  }
  return refs;
}

function normalizeEnvelope(envelope: AuditPromptEnvelope, allowedRefs: ReadonlySet<string>): AuditPromptEnvelope {
  return {
    prose: envelope.prose,
    evidenceRefs: envelope.evidenceRefs.filter((ref) => allowedRefs.has(ref)),
    caveats: envelope.caveats,
    ...(envelope.coverage ? { coverage: envelope.coverage } : {}),
    ...(envelope.displayHints ? { displayHints: envelope.displayHints } : {})
  };
}

async function generateOrParseEnvelope(
  generateEnvelope: TopicAuditHandlerOptions["generateEnvelope"],
  stageName: TopicAuditStageName,
  prompt: string,
  allowedRefs: ReadonlySet<string>
): Promise<AuditPromptEnvelope> {
  if (!generateEnvelope) {
    throw new Error("Audit LLM generator unavailable");
  }
  const raw = await generateEnvelope(stageName, prompt);
  return normalizeEnvelope(raw, allowedRefs);
}

function signalReadingFromEnvelope(
  packet: EvidencePacket,
  envelope: AuditPromptEnvelope,
  options: TopicAuditHandlerOptions,
  inputHash: string
): SignalReading {
  return {
    auditRunId: packet.auditRunId,
    inputHash,
    topicId: packet.topicId,
    signalId: packet.signalId,
    shortCode: packet.shortCode,
    reading: envelope.prose,
    evidenceRefs: envelope.evidenceRefs,
    watchNotes: envelope.caveats,
    promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p1,
    model: options.model ?? "unknown",
    generatedAt: nowIso(options)
  };
}

function lensMemoFromEnvelope(
  topicId: string,
  auditRunId: string,
  inputHash: string,
  stageName: TopicAuditStageName,
  envelope: AuditPromptEnvelope,
  promptVersion: string,
  options: TopicAuditHandlerOptions
): LensMemo {
  return {
    auditRunId,
    inputHash,
    topicId,
    stageName,
    prose: envelope.prose,
    evidenceRefs: envelope.evidenceRefs,
    caveats: envelope.caveats,
    ...(envelope.coverage ? { coverage: envelope.coverage } : {}),
    ...(envelope.displayHints ? { displayHints: envelope.displayHints } : {}),
    promptVersion,
    model: options.model ?? "unknown",
    generatedAt: nowIso(options)
  };
}

function reportMarkdown(report: TopicAuditReport): string {
  return [
    `# ${report.topicName}`,
    `§1 ${report.sections.overall}`,
    `§2 ${report.sections.lexicon}`,
    `§3 ${report.sections.scaleOrTime}`,
    `§4 ${report.sections.narratives}`,
    `§5 ${report.sections.audience}`,
    `§6 ${report.sections.absence}`,
    `§7 ${report.sections.editorial}`
  ].join("\n");
}

function buildReportFromEnvelope(
  topic: Topic,
  auditRunId: string,
  inputHash: string,
  envelope: AuditPromptEnvelope,
  signalReadings: SignalReading[],
  lensMemos: LensMemo[],
  options: TopicAuditHandlerOptions
): TopicAuditReport {
  const memoByStage = new Map(lensMemos.map((memo) => [memo.stageName, memo]));
  return {
    auditRunId,
    inputHash,
    topicId: topic.id,
    topicName: topic.name,
    generatedFrom: [
      ...signalReadings.map((reading) => `${reading.shortCode}:p1`),
      ...lensMemos.map((memo) => memo.stageName)
    ],
    coveragePerSection: {
      overall: envelope.coverage ?? "unknown",
      lexicon: memoByStage.get("lexicon")?.coverage ?? "unknown",
      scaleOrTime: envelope.coverage ?? "unknown",
      narratives: memoByStage.get("narrative")?.coverage ?? "unknown",
      audience: memoByStage.get("audience")?.coverage ?? "unknown",
      absence: memoByStage.get("absence")?.coverage ?? "unknown",
      editorial: envelope.coverage ?? "unknown"
    },
    sections: {
      overall: envelope.prose,
      lexicon: memoByStage.get("lexicon")?.prose ?? "",
      scaleOrTime: "",
      narratives: memoByStage.get("narrative")?.prose ?? "",
      audience: memoByStage.get("audience")?.prose ?? "",
      absence: memoByStage.get("absence")?.prose ?? "",
      editorial: envelope.prose
    },
    limitations: envelope.caveats,
    promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p6,
    model: options.model ?? "unknown",
    generatedAt: nowIso(options)
  };
}

async function saveMemos(
  storageArea: StorageAreaLike,
  topicId: string,
  auditRunId: string,
  inputHash: string,
  signalReadings: SignalReading[],
  lensMemos: LensMemo[]
): Promise<void> {
  await saveTopicAuditMemos(storageArea, topicId, {
    auditRunId,
    inputHash,
    signalReadings,
    lensMemos
  });
}

const AUDIT_STAGE_ORDER: TopicAuditStageName[] = [
  "p1-signal-reading",
  "lexicon",
  "narrative",
  "audience",
  "absence",
  "final"
];

function auditStageIndex(stageName: TopicAuditStageName): number {
  return AUDIT_STAGE_ORDER.indexOf(stageName);
}

async function runAuditPipeline(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  options: TopicAuditHandlerOptions,
  fromStage?: TopicAuditStageName
): Promise<TopicAuditHandlerResult> {
  const signals = await loadSignals(storageArea, session.id);
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const readySignalIds = auditReadySignalIds(session, signals);
  const inputHash = buildInputHash(topic, signals, itemsById);
  const auditRunId = `audit_${inputHash.replace(/^topic-audit:/, "")}`;
  const existingReport = await loadTopicAuditReport(storageArea, topic.id);
  const existingMemos = await loadTopicAuditMemos(storageArea, topic.id);
  if (!fromStage && existingReport?.inputHash === inputHash && existingMemos?.inputHash === inputHash) {
    return {
      auditReport: existingReport,
      auditMemos: existingMemos,
      auditValidatorFlags: validateTopicAuditDraft({
        packets: await loadTopicAuditEvidence(storageArea, topic.id),
        reportMarkdown: reportMarkdown(existingReport)
      })
    };
  }

  const packets = (await loadTopicAuditEvidence(storageArea, topic.id)).filter((packet) => packet.inputHash === inputHash);
  const evidence = packets.length ? packets : await buildAndSaveEvidence(storageArea, session, topic, auditRunId, inputHash);
  const allowedRefs = allAllowedRefs(evidence);
  const reusableMemos = existingMemos?.inputHash === inputHash ? existingMemos : null;
  const resumeIndex = fromStage ? auditStageIndex(fromStage) : 0;
  const signalReadings: SignalReading[] = reusableMemos
    ? (fromStage && resumeIndex > 0
        ? [...reusableMemos.signalReadings]
        : reusableMemos.signalReadings.filter((reading) => evidence.some((packet) => packet.signalId === reading.signalId)))
    : [];
  const lensMemos: LensMemo[] = fromStage && reusableMemos
    ? reusableMemos.lensMemos.filter((memo) => auditStageIndex(memo.stageName) < resumeIndex)
    : [];
  const p1Failures: string[] = [];

  const readingBySignalId = new Map(signalReadings.map((reading) => [reading.signalId, reading]));
  const missingPackets = evidence.filter((packet) => readySignalIds.has(packet.signalId) && !readingBySignalId.has(packet.signalId));
  if (missingPackets.length > 0) {
    for (const packet of missingPackets) {
      try {
        const envelope = await generateOrParseEnvelope(
          options.generateEnvelope,
          "p1-signal-reading",
          buildP1SignalReadingPrompt(packet),
          allowedRefs
        );
        signalReadings.push(signalReadingFromEnvelope(packet, envelope, options, inputHash));
      } catch {
        p1Failures.push(packet.shortCode);
      }
    }
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, signalReadings, lensMemos);
  }

  let lexiconMemo = lensMemos.find((memo) => memo.stageName === "lexicon") ?? null;
  if (!lexiconMemo) {
    const lexiconEnvelope = await generateOrParseEnvelope(
      options.generateEnvelope,
      "lexicon",
      buildP2LexiconPrompt({ topicName: topic.name, packets: evidence, signalReadings }),
      allowedRefs
    );
    if (p1Failures.length) {
      lexiconEnvelope.caveats = [...lexiconEnvelope.caveats, `P1 failures: ${p1Failures.join(", ")}`];
    }
    lexiconMemo = lensMemoFromEnvelope(topic.id, auditRunId, inputHash, "lexicon", lexiconEnvelope, TOPIC_AUDIT_PROMPT_VERSIONS.p2, options);
    lensMemos.push(lexiconMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, signalReadings, lensMemos);
  }

  if (!lensMemos.some((memo) => memo.stageName === "narrative")) {
    const narrativeMemo = lensMemoFromEnvelope(
      topic.id,
      auditRunId,
      inputHash,
      "narrative",
      await generateOrParseEnvelope(
        options.generateEnvelope,
        "narrative",
        buildP3NarrativePrompt({ topicName: topic.name, packets: evidence, signalReadings, lexiconMemo }),
        allowedRefs
      ),
      TOPIC_AUDIT_PROMPT_VERSIONS.p3,
      options
    );
    lensMemos.push(narrativeMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, signalReadings, lensMemos);
  }

  if (!lensMemos.some((memo) => memo.stageName === "audience")) {
    const audienceMemo = lensMemoFromEnvelope(
      topic.id,
      auditRunId,
      inputHash,
      "audience",
      await generateOrParseEnvelope(
        options.generateEnvelope,
        "audience",
        buildP4AudiencePrompt({ topicName: topic.name, packets: evidence, signalReadings, lensMemos }),
        allowedRefs
      ),
      TOPIC_AUDIT_PROMPT_VERSIONS.p4,
      options
    );
    lensMemos.push(audienceMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, signalReadings, lensMemos);
  }

  if (!lensMemos.some((memo) => memo.stageName === "absence")) {
    const absenceMemo = lensMemoFromEnvelope(
      topic.id,
      auditRunId,
      inputHash,
      "absence",
      await generateOrParseEnvelope(
        options.generateEnvelope,
        "absence",
        buildP5AbsencePrompt({ topicName: topic.name, packets: evidence, signalReadings, lensMemos }),
        allowedRefs
      ),
      TOPIC_AUDIT_PROMPT_VERSIONS.p5,
      options
    );
    lensMemos.push(absenceMemo);
    await saveMemos(storageArea, topic.id, auditRunId, inputHash, signalReadings, lensMemos);
  }

  const finalEnvelope = await generateOrParseEnvelope(
    options.generateEnvelope,
    "final",
    buildP6FinalReportPrompt({ topicName: topic.name, packets: evidence, signalReadings, lensMemos }),
    allowedRefs
  );
  const report = buildReportFromEnvelope(topic, auditRunId, inputHash, finalEnvelope, signalReadings, lensMemos, options);
  await saveTopicAuditReport(storageArea, report);
  const flags = validateTopicAuditDraft({ packets: evidence, reportMarkdown: reportMarkdown(report) });
  return {
    auditEvidence: evidence,
    auditMemos: { auditRunId, inputHash, signalReadings, lensMemos },
    auditReport: report,
    auditValidatorFlags: flags
  };
}

async function runP1ForSingleSignal(
  storageArea: StorageAreaLike,
  session: SessionRecord,
  topic: Topic,
  signalId: string,
  options: TopicAuditHandlerOptions
): Promise<TopicAuditHandlerResult> {
  const signals = await loadSignals(storageArea, session.id);
  const itemsById = new Map(session.items.map((item) => [item.id, item]));
  const readySignalIds = auditReadySignalIds(session, signals);
  const inputHash = buildInputHash(topic, signals, itemsById);
  const auditRunId = `audit_${inputHash.replace(/^topic-audit:/, "")}`;

  const existingPackets = (await loadTopicAuditEvidence(storageArea, topic.id)).filter((packet) => packet.inputHash === inputHash);
  const evidence = existingPackets.length ? existingPackets : await buildAndSaveEvidence(storageArea, session, topic, auditRunId, inputHash);
  const targetPacket = evidence.find((packet) => packet.signalId === signalId);
  if (!targetPacket) {
    throw new Error("Signal not found in evidence for this topic");
  }
  if (!readySignalIds.has(targetPacket.signalId)) {
    throw new Error("Signal is not ready for audit; crawl it before generating a reading");
  }
  const allowedRefs = allAllowedRefs(evidence);

  const existingMemos = await loadTopicAuditMemos(storageArea, topic.id);
  const reusableMemos = existingMemos?.inputHash === inputHash ? existingMemos : null;
  const signalReadings: SignalReading[] = reusableMemos
    ? reusableMemos.signalReadings.filter((reading) => reading.signalId !== signalId
        && evidence.some((packet) => packet.signalId === reading.signalId))
    : [];
  const lensMemos: LensMemo[] = reusableMemos ? [...reusableMemos.lensMemos] : [];

  const envelope = await generateOrParseEnvelope(
    options.generateEnvelope,
    "p1-signal-reading",
    buildP1SignalReadingPrompt(targetPacket),
    allowedRefs
  );
  signalReadings.push(signalReadingFromEnvelope(targetPacket, envelope, options, inputHash));
  await saveMemos(storageArea, topic.id, auditRunId, inputHash, signalReadings, lensMemos);

  return {
    auditEvidence: evidence,
    auditMemos: { auditRunId, inputHash, signalReadings, lensMemos }
  };
}

async function deleteMapEntry(storageArea: StorageAreaLike, storageKey: string, key: string): Promise<void> {
  const raw = await storageArea.get(storageKey);
  const map = raw[storageKey] && typeof raw[storageKey] === "object" && !Array.isArray(raw[storageKey])
    ? { ...(raw[storageKey] as Record<string, unknown>) }
    : {};
  delete map[key];
  await storageArea.set({ [storageKey]: map });
}

export async function handleTopicAuditMessage(
  storageArea: StorageAreaLike,
  options: TopicAuditHandlerOptions
): Promise<TopicAuditHandlerResult> {
  const { message } = options;
  switch (message.type) {
    case "topic/audit/build-evidence": {
      const session = findSession(options.sessions, message.sessionId);
      const topic = await findTopic(storageArea, message.sessionId, message.topicId);
      const signals = await loadSignals(storageArea, session.id);
      const inputHash = buildInputHash(topic, signals, new Map(session.items.map((item) => [item.id, item])));
      const auditRunId = `audit_${inputHash.replace(/^topic-audit:/, "")}`;
      const auditEvidence = await buildAndSaveEvidence(storageArea, session, topic, auditRunId, inputHash);
      return { auditEvidence };
    }
    case "topic/audit/run": {
      const session = findSession(options.sessions, message.sessionId);
      const topic = await findTopic(storageArea, message.sessionId, message.topicId);
      return runAuditPipeline(storageArea, session, topic, options, message.fromStage);
    }
    case "topic/audit/p1-signal": {
      const session = findSession(options.sessions, message.sessionId);
      const topic = await findTopic(storageArea, message.sessionId, message.topicId);
      return runP1ForSingleSignal(storageArea, session, topic, message.signalId, options);
    }
    case "topic/audit/get":
      return {
        auditEvidence: await loadTopicAuditEvidence(storageArea, message.topicId),
        auditMemos: await loadTopicAuditMemos(storageArea, message.topicId),
        auditReport: await loadTopicAuditReport(storageArea, message.topicId)
      };
    case "topic/audit/validate": {
      const report = await loadTopicAuditReport(storageArea, message.topicId);
      const packets = await loadTopicAuditEvidence(storageArea, message.topicId);
      return {
        auditValidatorFlags: report ? validateTopicAuditDraft({ packets, reportMarkdown: reportMarkdown(report) }) : []
      };
    }
    case "topic/audit/clear":
      await deleteMapEntry(storageArea, TOPIC_AUDIT_EVIDENCE_STORAGE_KEY, message.topicId);
      await deleteMapEntry(storageArea, TOPIC_AUDIT_MEMOS_STORAGE_KEY, message.topicId);
      await deleteMapEntry(storageArea, TOPIC_AUDIT_REPORTS_STORAGE_KEY, message.topicId);
      return { auditEvidence: [], auditMemos: null, auditReport: null };
    case "cross-topic/calibrate": {
      if (message.topicIds.length < 2) {
        throw new Error("Need at least 2 topics for cross-topic calibration");
      }
      const reports = await Promise.all(message.topicIds.map(async (topicId) => {
        const report = await loadTopicAuditReport(storageArea, topicId);
        const memos = await loadTopicAuditMemos(storageArea, topicId);
        if (!report || !memos) {
          throw new Error(`Missing audit report for ${topicId}`);
        }
        const absenceMemo = memos.lensMemos.find((memo) => memo.stageName === "absence")?.prose ?? "";
        return {
          topicId,
          topicName: report.topicName,
          absenceMemo,
          finalSummary: reportMarkdown(report)
        };
      }));
      const prompt = buildP8CrossTopicCalibrationPrompt({ topicReports: reports });
      const envelope = await generateOrParseEnvelope(options.generateEnvelope, "final", prompt, new Set());
      const calibration: CrossTopicCalibration = {
        id: `calibration_${Date.now().toString(36)}`,
        topicIds: message.topicIds,
        topicsCompared: reports.map((report) => report.topicName),
        decompositions: [{
          findingFromTopic: envelope.prose,
          perTopicResult: Object.fromEntries(reports.map((report) => [report.topicName, report.absenceMemo])),
          verdict: "undetermined",
          strength: "weak-inference",
          caveats: envelope.caveats
        }],
        promptVersion: TOPIC_AUDIT_PROMPT_VERSIONS.p8,
        model: options.model ?? "unknown",
        generatedAt: nowIso(options)
      };
      await saveCrossTopicCalibration(storageArea, calibration);
      return {
        crossTopicCalibration: calibration,
        auditValidatorFlags: validateCrossTopicCalibrationDraft({
          topicCount: reports.length,
          calibrationMarkdown: envelope.prose
        })
      };
    }
    default:
      return {};
  }
}
