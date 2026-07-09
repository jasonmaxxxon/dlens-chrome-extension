import type { EvidencePacket, LensMemo, ReactionCoverage, ReactionPattern, ReplyFragment, SignalReading } from "./topic-audit.ts";

export const TOPIC_AUDIT_PROMPT_VERSIONS = {
  p1: "topic-audit-p1.v2",
  p2: "topic-audit-p2.v2",
  p3: "topic-audit-p3.v2",
  p4: "topic-audit-p4.v1",
  p5: "topic-audit-p5.v1",
  p6: "topic-audit-p6.v2",
  p7: "topic-audit-p7.v1",
  p8: "topic-audit-p8.v1"
} as const;

export interface AuditPromptEnvelope {
  prose: string;
  evidenceRefs: string[];
  caveats: string[];
  coverage?: string;
  displayHints?: {
    themeChips?: string[];
    narrativeLanes?: AuditPromptNarrativeLane[];
    reactionCoverage?: ReactionCoverage;
    reactionPatterns?: ReactionPattern[];
  };
}

export type { AuditPromptNarrativeLane };

export const NARRATIVE_LANE_ICONS = [
  "heart",
  "heart-crack",
  "users",
  "user",
  "user-x",
  "message-circle",
  "message-square-warning",
  "banknote",
  "scale",
  "ban",
  "alert-triangle",
  "shield",
  "sparkles",
  "ghost",
  "clock",
  "calendar",
  "compass",
  "map",
  "lightbulb",
  "flag",
  "flame",
  "leaf",
  "trending-up",
  "trending-down",
  "activity",
  "eye",
  "eye-off",
  "lock",
  "key",
  "search"
] as const;

export type NarrativeLaneIcon = (typeof NARRATIVE_LANE_ICONS)[number];

interface AuditPromptNarrativeLane {
  id: string;
  label: string;
  signalRefs: string[];
  consensus: number;
  icon?: NarrativeLaneIcon;
}

interface ParsedDisplayHints {
  themeChips: string[];
  narrativeLanes: AuditPromptNarrativeLane[];
  reactionCoverage?: ReactionCoverage;
  reactionPatterns: ReactionPattern[];
}

const NARRATIVE_LANE_ICON_SET: ReadonlySet<string> = new Set(NARRATIVE_LANE_ICONS);

function readIcon(value: unknown): NarrativeLaneIcon | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return NARRATIVE_LANE_ICON_SET.has(normalized) ? (normalized as NarrativeLaneIcon) : undefined;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const stripped = stripCodeFence(raw);
  const candidates = [stripped];
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(stripped.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(candidate) as unknown;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const text = readTrimmedString(entry);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNonNegativeInteger(value: unknown): number | null {
  const parsed = readNumber(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function readProse(parsed: Record<string, unknown>): string {
  return readTrimmedString(
    parsed.prose
      ?? parsed.memo
      ?? parsed.summary
      ?? parsed.analysis
      ?? parsed.reading
      ?? parsed.report
  );
}

function readNarrativeLanes(value: unknown, allowedRefs?: ReadonlySet<string>): AuditPromptNarrativeLane[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const lanes: AuditPromptNarrativeLane[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const label = readTrimmedString(raw.label ?? raw.title ?? raw.name);
    if (!label) {
      continue;
    }
    const signalRefs = readStringArray(raw.signalRefs ?? raw.signal_refs ?? raw.refs ?? raw.evidenceRefs ?? raw.evidence_refs)
      .filter((ref) => !allowedRefs || allowedRefs.has(ref));
    const consensus = Math.max(0, Math.min(1, readNumber(raw.consensus ?? raw.strength ?? raw.score) ?? 0));
    const icon = readIcon(raw.icon);
    lanes.push({
      id: readTrimmedString(raw.id) || `lane-${lanes.length + 1}`,
      label,
      signalRefs,
      consensus,
      ...(icon ? { icon } : {})
    });
  }
  return lanes;
}

function readReactionCoverage(value: unknown): ReactionCoverage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const postCount = readNonNegativeInteger(raw.postCount ?? raw.post_count);
  const capturedCommentCount = readNonNegativeInteger(raw.capturedCommentCount ?? raw.captured_comment_count);
  const readCommentCount = readNonNegativeInteger(raw.readCommentCount ?? raw.read_comment_count);
  const usableAudienceCommentCount = readNonNegativeInteger(raw.usableAudienceCommentCount ?? raw.usable_audience_comment_count);
  if (
    postCount === null
    || capturedCommentCount === null
    || readCommentCount === null
    || usableAudienceCommentCount === null
  ) {
    return undefined;
  }
  return {
    postCount,
    capturedCommentCount,
    readCommentCount,
    usableAudienceCommentCount
  };
}

function readRefArray(value: unknown, allowedRefs?: ReadonlySet<string>): string[] {
  return readStringArray(value).filter((ref) => !allowedRefs || allowedRefs.has(ref));
}

function readReactionPatterns(value: unknown, allowedRefs?: ReadonlySet<string>): ReactionPattern[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const patterns: ReactionPattern[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const label = readTrimmedString(raw.label ?? raw.title ?? raw.name);
    const dynamicImplication = readTrimmedString(raw.dynamicImplication ?? raw.dynamic_implication ?? raw.implication);
    const nComments = readNonNegativeInteger(raw.nComments ?? raw.n_comments ?? raw.commentCount ?? raw.comment_count);
    const nAuthors = readNonNegativeInteger(raw.nAuthors ?? raw.n_authors ?? raw.authorCount ?? raw.author_count) ?? 0;
    const coverageDenominator = readNonNegativeInteger(raw.coverageDenominator ?? raw.coverage_denominator ?? raw.denominator);
    if (!label || !dynamicImplication || nComments === null || coverageDenominator === null) {
      continue;
    }
    const supportRefs = readRefArray(raw.supportRefs ?? raw.support_refs ?? raw.evidenceRefs ?? raw.evidence_refs, allowedRefs);
    const counterRefs = readRefArray(raw.counterRefs ?? raw.counter_refs, allowedRefs);
    const representativeRefs = readRefArray(raw.representativeRefs ?? raw.representative_refs ?? raw.exampleRefs ?? raw.example_refs, allowedRefs);
    const counterRepresentativeRefs = readRefArray(raw.counterRepresentativeRefs ?? raw.counter_representative_refs ?? raw.counterExampleRefs ?? raw.counter_example_refs, allowedRefs);
    if ([...supportRefs, ...counterRefs, ...representativeRefs, ...counterRepresentativeRefs].length === 0) {
      continue;
    }
    const icon = readIcon(raw.icon);
    patterns.push({
      id: readTrimmedString(raw.id) || `reaction-${patterns.length + 1}`,
      label,
      dynamicImplication,
      nComments,
      nAuthors,
      coverageDenominator,
      supportRefs,
      counterRefs,
      representativeRefs,
      counterRepresentativeRefs,
      ...(icon ? { icon } : {})
    });
  }
  return patterns;
}

export function parseAuditPromptEnvelopeResponse(
  raw: string,
  allowedRefs?: ReadonlySet<string>
): AuditPromptEnvelope | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return null;
  }

  const prose = readProse(parsed);
  if (!prose) {
    return null;
  }
  const evidenceRefs = readStringArray(parsed.evidenceRefs ?? parsed.evidence_refs)
    .filter((ref) => !allowedRefs || allowedRefs.has(ref));
  const caveats = readStringArray(parsed.caveats);
  const coverage = readTrimmedString(parsed.coverage);
  const rawDisplayHints = parsed.displayHints ?? parsed.display_hints;
  const displayHints: ParsedDisplayHints = rawDisplayHints && typeof rawDisplayHints === "object" && !Array.isArray(rawDisplayHints)
    ? {
        themeChips: readStringArray((rawDisplayHints as Record<string, unknown>).themeChips ?? (rawDisplayHints as Record<string, unknown>).theme_chips),
        narrativeLanes: readNarrativeLanes(
          (rawDisplayHints as Record<string, unknown>).narrativeLanes ?? (rawDisplayHints as Record<string, unknown>).narrative_lanes,
          allowedRefs
        ),
        reactionCoverage: readReactionCoverage((rawDisplayHints as Record<string, unknown>).reactionCoverage ?? (rawDisplayHints as Record<string, unknown>).reaction_coverage),
        reactionPatterns: readReactionPatterns(
          (rawDisplayHints as Record<string, unknown>).reactionPatterns ?? (rawDisplayHints as Record<string, unknown>).reaction_patterns,
          allowedRefs
        )
      }
    : { themeChips: [], narrativeLanes: [], reactionPatterns: [] };

  return {
    prose,
    evidenceRefs,
    caveats,
    ...(coverage ? { coverage } : {}),
    ...(displayHints.themeChips.length > 0 || displayHints.narrativeLanes.length > 0 || displayHints.reactionCoverage || displayHints.reactionPatterns.length > 0
      ? {
          displayHints: {
            ...(displayHints.themeChips.length > 0 ? { themeChips: displayHints.themeChips } : {}),
            ...(displayHints.narrativeLanes.length > 0 ? { narrativeLanes: displayHints.narrativeLanes } : {}),
            ...(displayHints.reactionCoverage ? { reactionCoverage: displayHints.reactionCoverage } : {}),
            ...(displayHints.reactionPatterns.length > 0 ? { reactionPatterns: displayHints.reactionPatterns } : {})
          }
        }
      : {})
  };
}

interface TopicPromptInput {
  topicName: string;
  packets: EvidencePacket[];
  signalReadings: SignalReading[];
  lensMemos?: LensMemo[];
}

interface P3PromptInput extends TopicPromptInput {
  lexiconMemo: LensMemo;
}

interface P7PromptInput {
  topicName: string;
  packets: EvidencePacket[];
  reportMarkdown: string;
  memos: LensMemo[];
}

interface P8PromptInput {
  topicReports: Array<{
    topicId: string;
    topicName: string;
    absenceMemo: string;
    finalSummary: string;
  }>;
}

const ENVELOPE_SCHEMA = `{
  "prose": "自由 prose，不是 taxonomy",
  "evidenceRefs": ["S1.OP", "S1.R1"],
  "caveats": ["資料缺口或推論限制"],
  "coverage": "x/n",
  "displayHints": {
    "themeChips": ["只放 broad themes，不放 fine tags"],
    "narrativeLanes": [
      { "id": "lane-1", "label": "敘事線名稱", "signalRefs": ["S1.OP"], "consensus": 0.6, "icon": "heart" }
    ]
  }
}`;

const LANGUAGE_RULE = "語言：themeChips 與 narrativeLanes.label 必須使用議題原文語言（如議題是中文，必用中文；禁止英文 taxonomy 詞如 \"Dating Market Dynamics\"）。prose 同樣用議題原文語言。";

const NARRATIVE_ICON_RULE = `narrativeLanes.icon 必選一個，從下列 whitelist 挑最貼合該敘事 mood 的：${NARRATIVE_LANE_ICONS.join(", ")}。冷僻就選 message-circle。`;

function likesLabel(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function renderFragment(fragment: ReplyFragment): string {
  return `${fragment.ref} [♥${likesLabel(fragment.likes)}] @${fragment.author || "unknown"}: ${fragment.text}`;
}

function renderPacket(packet: EvidencePacket, includeGaps = true): string {
  const lines = [
    `## ${packet.shortCode} (${packet.signalId})`,
    `${packet.shortCode}.OP [♥${likesLabel(packet.opLikes)}] @${packet.opAuthor || "unknown"}: ${packet.opText || "（無 OP text）"}`,
    ...packet.replyFragments.map(renderFragment)
  ];
  if (includeGaps && packet.gaps.length > 0) {
    lines.push(`GAPS: ${packet.gaps.join(" / ")}`);
  }
  return lines.join("\n");
}

function renderPackets(packets: EvidencePacket[]): string {
  return packets.map((packet) => renderPacket(packet)).join("\n\n");
}

function collectCitedRefs(input: TopicPromptInput): Set<string> {
  return new Set([
    ...input.signalReadings.flatMap((reading) => reading.evidenceRefs),
    ...(input.lensMemos ?? []).flatMap((memo) => memo.evidenceRefs)
  ]);
}

function renderCitedFragments(input: TopicPromptInput): string {
  const citedRefs = collectCitedRefs(input);
  return input.packets
    .map((packet) => {
      const lines = [
        `## ${packet.shortCode} (${packet.signalId})`,
        `${packet.shortCode}.OP [♥${likesLabel(packet.opLikes)}] @${packet.opAuthor || "unknown"}: ${packet.opText || "（無 OP text）"}`,
        ...packet.replyFragments
          .filter((fragment) => citedRefs.has(fragment.ref))
          .map(renderFragment)
      ];
      if (packet.gaps.length > 0) {
        lines.push(`GAPS: ${packet.gaps.join(" / ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function renderSignalReadings(readings: SignalReading[]): string {
  if (!readings.length) {
    return "（尚無 P1 readings）";
  }
  return readings
    .map((reading) => `## ${reading.shortCode}\n${reading.reading}\nRefs: ${reading.evidenceRefs.join(", ")}\nWatch: ${reading.watchNotes.join(" / ") || "none"}`)
    .join("\n\n");
}

function renderLensMemos(memos: LensMemo[] = []): string {
  if (!memos.length) {
    return "（尚無 LensMemo）";
  }
  return memos
    .map((memo) => `## ${memo.stageName} · ${memo.coverage ?? "coverage unknown"}\n${memo.prose}\nRefs: ${memo.evidenceRefs.join(", ")}\nCaveats: ${memo.caveats.join(" / ") || "none"}`)
    .join("\n\n");
}

function renderEnvelopeInstruction(options: { withNarrativeIcon?: boolean } = {}): string {
  return [
    "只回傳 JSON，不要 markdown fence。",
    "JSON envelope 固定如下；prose 可以自由寫，但 envelope 要可 parse：",
    ENVELOPE_SCHEMA,
    LANGUAGE_RULE,
    ...(options.withNarrativeIcon ? [NARRATIVE_ICON_RULE] : [])
  ].join("\n");
}

export function buildP1SignalReadingPrompt(packet: EvidencePacket): string {
  return [
    "你要 cold-read 一則 Threads 訊號。先不要套框架，也不要繼承任何既有 AI tags/gist。",
    "第一反應先回答：你看到什麼？這篇在發生什麼？",
    "",
    "[Evidence]",
    renderPacket(packet, true),
    "",
    "optional lens（如果有用才參考，不是必填分類）：",
    "- OP 在做什麼動作？例如求助、立論、訴苦、戲謔、元披露、issue prescription。",
    "- reply 對 OP 做什麼動作？例如共鳴、反駁、校正框架、升級、漂移、否決出路。",
    "",
    "紀律：",
    "- 只引用本訊號 refs：S#.OP / S#.OPC# / S#.OPR# / S#.R# / S#.P#。",
    "- **每次在 prose 中提到 OP / 留言 / 接話的具體行為時，必須在該句末或該短語後 inline 標註對應 ref，用 [Sx.OP] / [Sx.R1] 方括號格式**。例如：「OP 表達困惑 [S1.OP]，讀者建議退出 [S1.R2]。」這些 refs 之後會被 UI 包裝成可 hover 看原文的 chip。",
    "- 不 cluster、不命名 narrative、不抽 lexicon、不打 enum。",
    "- watchNotes 是 hook，不是結論。",
    "",
    renderEnvelopeInstruction()
  ].join("\n");
}

export function buildP2LexiconPrompt(input: TopicPromptInput): string {
  return [
    `Topic: ${input.topicName}`,
    "P2 Lexicon：從 P0 evidence + P1 readings 自由歸納詞彙層觀察。",
    "focus 是 word/phrase/register，不是 narrative。",
    "",
    "PROBE（檢查，不預設結果）：",
    "- 有沒有量化/算帳詞群？",
    "- 有沒有 future-positive 詞？",
    "- 有沒有正向 prescription 詞？",
    "- 有沒有集體/制度 vocabulary？",
    "- 同一個詞有沒有反向用法？哪些詞 OP-coined、哪些 reader-coined？",
    "詞層缺席只能說「在 captured evidence 中缺席」，不能說整個 discourse 缺席。",
    "",
    "[Evidence]",
    renderPackets(input.packets),
    "",
    "[P1 readings]",
    renderSignalReadings(input.signalReadings),
    "",
    renderEnvelopeInstruction()
  ].join("\n");
}

export function buildP3NarrativePrompt(input: P3PromptInput): string {
  return [
    `Topic: ${input.topicName}`,
    "P3 Narrative：從 readings + lexicon 自然長出敘事。自然幾條就幾條，不強制數量。",
    "每條敘事 = story shape（setup → tension → outcome）+ evidence + boundary/反例/inversion。",
    "敘事是 story shape，不是 proposition、不是 posture；不要繼承其他 topic 的 narrative 名稱。",
    "",
    "[P1 readings]",
    renderSignalReadings(input.signalReadings),
    "",
    "[P2 lexicon memo]",
    input.lexiconMemo.prose,
    "",
    renderEnvelopeInstruction({ withNarrativeIcon: true })
  ].join("\n");
}

export function buildP4AudiencePrompt(input: TopicPromptInput): string {
  return [
    `Topic: ${input.topicName}`,
    "P4 Audience：觀察 reader 對 OP 做了什麼動作。see-then-write：看到才寫，沒看到不寫。",
    "可參考但不是必填：接住、共鳴、反駁、校正 OP 框架、升級為結構分析、漂移、bookmark、為對立價值辯護。",
    "排除 OP 自我接話（S#.OPC# / S#.OPR#）與 placeholder。top-3 reply 不等於整體議題共識。每個型態標 n；n=1~2 不可宣稱穩定 pattern。",
    "",
    "[Evidence]",
    renderPackets(input.packets),
    "",
    "[Prior memos]",
    renderLensMemos(input.lensMemos),
    "",
    renderEnvelopeInstruction()
  ].join("\n");
}

export function buildP5AbsencePrompt(input: TopicPromptInput): string {
  return [
    `Topic: ${input.topicName}`,
    "P5 Absence：誰沒有出聲？什麼解法/立場/視角缺席？這是唯一允許推論性結論的 pass，但每個 claim 必須 evidence-bound。",
    "強度標記：[強] present 強烈反襯 absent；[中] 可能 sample artifact；[弱/推論] 明確 speculative。",
    "data gap 必須與真 absence 區分；queued、OP 自我接話佔滿 preview、top-3-only 都要標 caveat。",
    "不可把單 topic 觀察寫成 platform/culture 斷言；那是 P8 的事。",
    "可檢查但不可預設：中間層/collective scale、object-never-subject、escape ramp 是否被辯護或關閉。",
    "",
    "[Evidence]",
    renderPackets(input.packets),
    "",
    "[Prior readings]",
    renderSignalReadings(input.signalReadings),
    "",
    "[Prior memos]",
    renderLensMemos(input.lensMemos),
    "",
    renderEnvelopeInstruction()
  ].join("\n");
}

export function buildP6FinalReportPrompt(input: TopicPromptInput): string {
  return [
    `Topic: ${input.topicName}`,
    "P6 Editor Synthesis：寫最終 report。固定 7 節，內容由 evidence + LensMemo 長出，不靠 schema 拼。",
    "7 節：1 整體判讀；2 共同用字；3 風向/時間；4 narrative clusters；5 audience reaction；6 缺席聲音/outliers；7 editorial reading。",
    "§7 editorial 必須 prose，必須指認語言生態形狀：哪些位置有語言、哪些沒有、哪些被撤回信用、哪些連詞都沒長出。",
    "每節標 coverage。資料不足明說。不可宣稱 platform-level，最多說本 topic 內觀察到。",
    "不要預設任何在其他 topic 出現過的 finding；每個判讀都從本 topic evidence 長出。",
    "",
    "[Evidence digest: OP + cited comments only]",
    renderCitedFragments(input),
    "",
    "[P1 readings]",
    renderSignalReadings(input.signalReadings),
    "",
    "[Lens memos]",
    renderLensMemos(input.lensMemos),
    "",
    renderEnvelopeInstruction()
  ].join("\n");
}

export function buildP7ValidatorPrompt(input: P7PromptInput): string {
  return [
    `Topic: ${input.topicName}`,
    "P7 Single-topic validator：機械檢查，只 flag 不重寫。",
    "查：claim 是否有 signal id citation；引用是否存在；likes/引述是否與 P0 一致；queued/unknown 不可當 0；negative claim scope；evidence thinness；precise figures 是否真的算過。",
    "severity：[FAIL]=矛盾/算術錯；[WEAK]=須降調；[SCOPE]=須限定範圍。",
    "",
    "[P0 evidence]",
    renderPackets(input.packets),
    "",
    "[Memos]",
    renderLensMemos(input.memos),
    "",
    "[Report markdown]",
    input.reportMarkdown,
    "",
    "Return JSON: {\"flags\":[{\"severity\":\"FAIL|WEAK|SCOPE\",\"section\":\"...\",\"claim\":\"...\",\"reason\":\"...\",\"evidenceRefs\":[\"S1.OP\"]}]}"
  ].join("\n");
}

export function buildP8CrossTopicCalibrationPrompt(input: P8PromptInput): string {
  return [
    "P8 Cross-topic calibration：對照 2+ 個 topic 的 absence + final report，拆 topic-specific vs platform/culture。",
    "verdict 必須是 topic-specific / platform-affordance / cultural-pattern / undetermined。",
    "2 個 topic 只能說 strongly consistent with，不能說 proved / 證實。必須說還需要什麼額外 topic 才能收窄。",
    "",
    "[Topic reports]",
    input.topicReports
      .map((report) => `## ${report.topicName} (${report.topicId})\nAbsence:\n${report.absenceMemo}\nFinal:\n${report.finalSummary}`)
      .join("\n\n"),
    "",
    "Return JSON: {\"decompositions\":[{\"findingFromTopic\":\"...\",\"perTopicResult\":{},\"verdict\":\"topic-specific|platform-affordance|cultural-pattern|undetermined\",\"strength\":\"strong|medium|weak-inference\",\"caveats\":[]}]}"
  ].join("\n");
}

const FORBIDDEN_ASSERTION_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "future-tense-absence", pattern: /(沒有|缺少|缺乏|無)\s*(future tense|future|希望|未來)/i },
  { id: "prescription-absence", pattern: /(沒有|缺少|缺乏|無)\s*(prescription|應該|建議|要求)/i },
  { id: "positive-narrative-suppression", pattern: /(正面|樂觀).{0,12}(壓制|被壓制|撤回信用|被打壓)/ },
  { id: "reader-no-debate", pattern: /(reader|讀者).{0,10}(不辯論|沒有辯論|同方向共鳴)/i },
  { id: "mourning-topic", pattern: /哀悼型/ },
  { id: "quantification-cultural-default", pattern: /(算帳|量化).{0,16}(default mode|文化通則|文化模式)/i }
];

function isNegativeInstruction(sentence: string): boolean {
  return /(不要|不可|不能|不得|不可以).{0,8}預設/.test(sentence)
    || /不可植入/.test(sentence)
    || /必須.*重新長出/.test(sentence);
}

export function findForbiddenFindingAssertions(prompt: string): string[] {
  const flags: string[] = [];
  const instructionBlock = prompt.split(/\n\[(?:Evidence|P0 evidence|P1 readings|Prior|Lens memos|Memos|Report markdown|Topic reports)\]/)[0] ?? prompt;
  const sentences = instructionBlock.split(/[。！？\n]/).map((part) => part.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (isNegativeInstruction(sentence)) {
      continue;
    }
    for (const entry of FORBIDDEN_ASSERTION_PATTERNS) {
      if (entry.pattern.test(sentence) && !flags.includes(entry.id)) {
        flags.push(entry.id);
      }
    }
  }
  return flags;
}
