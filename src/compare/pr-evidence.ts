import type {
  PrCampaign,
  PrCriteriaMatches,
  PrCriterion,
  PrEvidenceRow
} from "../state/pr-evidence-storage.ts";
import { emptyPrCriteriaMatches, PR_CRITERION_IDS } from "../state/pr-evidence-storage.ts";

export interface PrSummaryFacts {
  campaign_name: string;
  total_rows: number;
  observed_metrics: {
    likes: number;
    comments: number;
    reposts: number;
    views: number;
    views_rows_observed: number;
  };
  criteria: Array<{
    id: string;
    label: string;
    matched_rows: number;
    pull_through_rate: number;
  }>;
  top_rows: Array<{
    author_handle: string;
    caption: string;
    likes: number;
    comments: number;
    matched_count: number;
    matched_labels: string[];
  }>;
}

function parseJsonValue(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidates = [
    text,
    fenced?.[1] || "",
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
    text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next likely JSON span.
    }
  }
  return null;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = parseJsonValue(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCriteriaLabel(value: unknown, index: number): string {
  return readString(value) || `criterion_${index + 1}`;
}

function readCriteriaEntryLabel(value: unknown, index: number): string {
  if (typeof value === "string") {
    return normalizeCriteriaLabel(value, index);
  }
  if (!value || typeof value !== "object") {
    return `criterion_${index + 1}`;
  }
  const entry = value as Record<string, unknown>;
  return normalizeCriteriaLabel(
    entry.label ?? entry.name ?? entry.criterion ?? entry.message ?? entry.text,
    index
  );
}

function readBooleanLike(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return /^(true|yes|y|1|✓|match|matched)$/i.test(value.trim());
}

export function normalizePrCriteriaSuggestionResponse(raw: string): PrCampaign["criteria"] {
  const parsedValue = parseJsonValue(raw);
  const parsedObject = parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
    ? parsedValue as Record<string, unknown>
    : null;
  const entries = Array.isArray(parsedValue)
    ? parsedValue
    : Array.isArray(parsedObject?.criteria)
      ? parsedObject.criteria
      : PR_CRITERION_IDS.map((id) => parsedObject?.[id]);
  return PR_CRITERION_IDS.map((id, index) => {
    return {
      id,
      label: readCriteriaEntryLabel(entries[index], index)
    };
  }) as PrCampaign["criteria"];
}

export function isDefaultPrCriteria(criteria: PrCampaign["criteria"]): boolean {
  return criteria.every((criterion, index) => criterion.label === `criterion_${index + 1}`);
}

export function parsePrCriteriaMatchResponse(raw: string, knownRowIds: string[]): Record<string, PrCriteriaMatches> {
  const known = new Set(knownRowIds);
  const parsedValue = parseJsonValue(raw);
  const parsed = parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
    ? parsedValue as Record<string, unknown>
    : null;
  const rows = Array.isArray(parsedValue) ? parsedValue : Array.isArray(parsed?.rows) ? parsed.rows : [];
  const result: Record<string, PrCriteriaMatches> = {};
  for (const id of knownRowIds) {
    result[id] = emptyPrCriteriaMatches();
  }
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const rawRow = row as Record<string, unknown>;
    const rowId = readString(rawRow.row_id) || readString(rawRow.rowId) || readString(rawRow.id);
    if (!known.has(rowId)) {
      continue;
    }
    const rawMatches = rawRow.matches;
    const matches = rawMatches && typeof rawMatches === "object" && !Array.isArray(rawMatches)
      ? rawMatches as Record<string, unknown>
      : {};
    const matchIds = new Set(Array.isArray(rawMatches) ? rawMatches.map((value) => readString(value)).filter(Boolean) : []);
    result[rowId] = {
      c1: readBooleanLike(matches.c1) || matchIds.has("c1"),
      c2: readBooleanLike(matches.c2) || matchIds.has("c2"),
      c3: readBooleanLike(matches.c3) || matchIds.has("c3"),
      c4: readBooleanLike(matches.c4) || matchIds.has("c4"),
      c5: readBooleanLike(matches.c5) || matchIds.has("c5"),
      c6: readBooleanLike(matches.c6) || matchIds.has("c6")
    };
  }
  if (parsed) {
    for (const rowId of knownRowIds) {
      const rawMatches = parsed[rowId];
      if (!rawMatches || typeof rawMatches !== "object") {
        continue;
      }
      const matches = Array.isArray(rawMatches) ? {} : rawMatches as Record<string, unknown>;
      const matchIds = new Set(Array.isArray(rawMatches) ? rawMatches.map((value) => readString(value)).filter(Boolean) : []);
      result[rowId] = {
        c1: readBooleanLike(matches.c1) || matchIds.has("c1"),
        c2: readBooleanLike(matches.c2) || matchIds.has("c2"),
        c3: readBooleanLike(matches.c3) || matchIds.has("c3"),
        c4: readBooleanLike(matches.c4) || matchIds.has("c4"),
        c5: readBooleanLike(matches.c5) || matchIds.has("c5"),
        c6: readBooleanLike(matches.c6) || matchIds.has("c6")
      };
    }
  }
  return result;
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function criterionKeywords(label: string): string[] {
  const normalized = normalizeMatchText(label);
  const keywords = new Set<string>();
  const add = (...values: string[]) => values.forEach((value) => keywords.add(normalizeMatchText(value)));

  for (const word of label.match(/#[\p{L}\p{N}_-]+|[\p{L}\p{N}_+]{3,}/gu) || []) {
    add(word);
  }
  if (/mannings|萬寧|boostup|campaign|brand/.test(normalized)) {
    add("萬寧", "mannings", "boostup", "#manningsboostup");
  }
  if (/好狀態|wellness|健康|身心|holistic/.test(normalized)) {
    add("好狀態", "wellness", "健康", "身心", "全方位");
  }
  if (/advisor|顧問|可信|專業|檢測|專家|technology|智能/.test(normalized)) {
    add("健康檢測", "專家", "顧問", "可信", "智能", "advisor");
  }
  if (/immersive|沉浸|嘉年華|體驗|carnival|experience|快閃/.test(normalized)) {
    add("嘉年華", "沉浸", "體驗", "快閃", "workshop", "市集");
  }
  if (/westk|西九|文化區|location|date|25|26/.test(normalized)) {
    add("西九", "文化區", "4月25", "4月26", "25/04", "26/04", "25/4", "26/4");
  }
  if (/six|6|六|40|50|zone|主題區|scale/.test(normalized)) {
    add("六大", "6大", "主題區", "40", "50", "體驗", "專家");
  }
  if (/ticket|cta|門票|購票|發售|participation/.test(normalized)) {
    add("門票", "購票", "票價", "早鳥", "發售", "參加");
  }
  return [...keywords].filter((keyword) => keyword.length >= 2 && !/^criterion_?\d+$/i.test(keyword));
}

export function buildDeterministicPrCriteriaMatches(campaign: PrCampaign, rows: PrEvidenceRow[]): Record<string, PrCriteriaMatches> {
  const result: Record<string, PrCriteriaMatches> = {};
  const keywordSets = campaign.criteria.map((criterion) => criterionKeywords(criterion.label));
  for (const row of rows) {
    const text = normalizeMatchText(`${row.caption} ${row.expectedEngagement || ""} ${row.authorHandle}`);
    const matches = emptyPrCriteriaMatches();
    for (const id of PR_CRITERION_IDS) {
      const index = PR_CRITERION_IDS.indexOf(id);
      matches[id] = keywordSets[index]?.some((keyword) => text.includes(keyword)) || false;
    }
    result[row.id] = matches;
  }
  return result;
}

export function mergePrCriteriaMatches(
  primary: Record<string, PrCriteriaMatches>,
  fallback: Record<string, PrCriteriaMatches>,
  knownRowIds: string[]
): Record<string, PrCriteriaMatches> {
  const result: Record<string, PrCriteriaMatches> = {};
  for (const rowId of knownRowIds) {
    const base = primary[rowId] || emptyPrCriteriaMatches();
    const backstop = fallback[rowId] || emptyPrCriteriaMatches();
    result[rowId] = {
      c1: base.c1 || backstop.c1,
      c2: base.c2 || backstop.c2,
      c3: base.c3 || backstop.c3,
      c4: base.c4 || backstop.c4,
      c5: base.c5 || backstop.c5,
      c6: base.c6 || backstop.c6
    };
  }
  return result;
}

function csvEscape(value: string | number | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseMetricCount(label: string): number | null {
  const match = String(label || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)(?:\s*([kKmM萬万千]))?/);
  if (!match) {
    return null;
  }
  let value = Number(match[1]);
  const suffix = match[2] || "";
  if (!Number.isFinite(value)) {
    return null;
  }
  if (/[萬万]/.test(suffix)) value *= 10000;
  else if (/千/.test(suffix)) value *= 1000;
  else if (/[kK]/.test(suffix)) value *= 1000;
  else if (/[mM]/.test(suffix)) value *= 1000000;
  return Math.round(value);
}

export function inferPrViewsFromText(text: string): number | null {
  const source = String(text || "").replace(/\s+/g, " ");
  const english = source.match(/(\d+(?:\.\d+)?\s*(?:[kKmM]|萬|万|千)?)\s*(?:views|view)\b/i);
  if (english) {
    return parseMetricCount(english[1]);
  }
  const chinese = source.match(/(\d+(?:\.\d+)?\s*(?:[kKmM]|萬|万|千)?)\s*(?:次)?(?:瀏覽|浏览|觀看|观看|查看)/);
  if (chinese) {
    return parseMetricCount(chinese[1]);
  }
  return null;
}

function observedViews(row: PrEvidenceRow): number | undefined {
  if (typeof row.metrics.views === "number") {
    return row.metrics.views;
  }
  return inferPrViewsFromText(row.caption) ?? undefined;
}

function criteriaHeaders(criteria: PrCriterion[]): string[] {
  return criteria.map((criterion, index) => criterion.label.trim() || `criterion_${index + 1}`);
}

export function buildPrEvidenceCsvRows(campaign: PrCampaign, rows: PrEvidenceRow[], limit?: number): string[][] {
  const header = [
    "post_url",
    "author_handle",
    "post_caption",
    "likes",
    "comments",
    "reposts",
    "views",
    "expected_engagement",
    ...criteriaHeaders(campaign.criteria),
    "manual_notes",
    "collected_at"
  ];
  const body = (typeof limit === "number" ? rows.slice(0, limit) : rows).map((row) => [
    row.postUrl,
    row.authorHandle,
    row.caption,
	    String(row.metrics.likes ?? ""),
	    String(row.metrics.comments ?? ""),
	    String(row.metrics.reposts ?? ""),
	    String(observedViews(row) ?? ""),
	    row.expectedEngagement || "",
	    ...PR_CRITERION_IDS.map((id) => row.criteriaMatches[id] ? "✓" : ""),
    "",
    row.collectedAt
  ]);
  return [header, ...body];
}

export function buildPrEvidenceCsv(campaign: PrCampaign, rows: PrEvidenceRow[]): string {
  return `\uFEFF${buildPrEvidenceCsvRows(campaign, rows).map((line) => line.map(csvEscape).join(",")).join("\n")}`;
}

function matchedCount(row: PrEvidenceRow): number {
  return PR_CRITERION_IDS.filter((id) => row.criteriaMatches[id]).length;
}

function compactCaption(caption: string, maxLength = 180): string {
  const cleaned = caption.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function buildPrSummaryFacts(campaign: PrCampaign, rows: PrEvidenceRow[]): PrSummaryFacts {
  const totalRows = rows.length;
  const observedMetrics = rows.reduce(
    (acc, row) => {
      acc.likes += row.metrics.likes || 0;
      acc.comments += row.metrics.comments || 0;
      acc.reposts += row.metrics.reposts || 0;
      const views = observedViews(row);
      if (typeof views === "number") {
        acc.views += views;
        acc.views_rows_observed += 1;
      }
      return acc;
    },
    { likes: 0, comments: 0, reposts: 0, views: 0, views_rows_observed: 0 }
  );
  return {
    campaign_name: campaign.name,
    total_rows: totalRows,
    observed_metrics: observedMetrics,
    criteria: campaign.criteria.map((criterion) => {
      const matchedRows = rows.filter((row) => row.criteriaMatches[criterion.id]).length;
      return {
        id: criterion.id,
        label: criterion.label,
        matched_rows: matchedRows,
        pull_through_rate: totalRows ? matchedRows / totalRows : 0
      };
    }),
    top_rows: [...rows]
      .sort((a, b) => matchedCount(b) - matchedCount(a) || (b.metrics.likes || 0) - (a.metrics.likes || 0))
      .slice(0, 5)
	      .map((row) => ({
	        author_handle: row.authorHandle,
	        caption: compactCaption(row.caption),
	        likes: row.metrics.likes || 0,
	        comments: row.metrics.comments || 0,
	        matched_count: matchedCount(row),
	        matched_labels: campaign.criteria
	          .filter((criterion) => row.criteriaMatches[criterion.id])
	          .map((criterion) => criterion.label)
	      }))
	  };
	}

export function buildDeterministicPrSummary(facts: PrSummaryFacts): string {
  const sortedCriteria = [...facts.criteria].sort((a, b) => b.matched_rows - a.matched_rows);
  const bestCriterion = sortedCriteria[0];
  const weakCriteria = sortedCriteria.filter((criterion) => criterion.matched_rows === 0).slice(0, 3);
  const totalInteractions = facts.observed_metrics.likes + facts.observed_metrics.comments + facts.observed_metrics.reposts;
  const viewsCopy = facts.observed_metrics.views_rows_observed
    ? `Views are observed on ${facts.observed_metrics.views_rows_observed} of ${facts.total_rows} rows and should be treated as partial platform-visible data.`
    : "Views are not consistently available in the collected evidence and should not be reported as total reach.";
  const criteriaRows = sortedCriteria
    .map((criterion) => `| ${criterion.label || criterion.id} | ${criterion.matched_rows}/${facts.total_rows} | ${percent(criterion.pull_through_rate)} |`)
    .join("\n");
  const highlights = facts.top_rows.length
    ? facts.top_rows.slice(0, 5).map((row, index) => [
      `${index + 1}. **${row.author_handle || "Unknown author"}** - ${row.matched_count}/6 criteria matched, ${row.likes} likes, ${row.comments} comments.`,
      `   Matched: ${row.matched_labels.length ? row.matched_labels.join("; ") : "No criteria matched."}`,
      `   Evidence excerpt: "${row.caption || "No caption captured."}"`
    ].join("\n")).join("\n")
    : "No collected evidence rows are available yet.";
  const strongestCopy = bestCriterion
    ? `Strongest message pull-through is **${bestCriterion.label || bestCriterion.id}** with ${bestCriterion.matched_rows}/${facts.total_rows} rows (${percent(bestCriterion.pull_through_rate)}).`
    : "No message pull-through criteria are available yet.";
  const weakCopy = weakCriteria.length
    ? `Criteria with no current evidence: ${weakCriteria.map((criterion) => criterion.label || criterion.id).join("; ")}.`
    : "All configured criteria have at least one matched evidence row.";

  return [
    `# ${facts.campaign_name} - PR Evidence Audit Summary`,
    "",
    "## Executive Read",
    `This audit reviews **${facts.total_rows} collected Threads posts** against the configured PR message criteria. It is an evidence-led pull-through read, not a reach, EAV, or all-channel performance report.`,
    strongestCopy,
    `Observed interaction signals across collected rows: **${facts.observed_metrics.likes} likes**, **${facts.observed_metrics.comments} comments**, and **${facts.observed_metrics.reposts} reposts** (${totalInteractions} total observed interactions). ${viewsCopy}`,
    "",
    "## Message Pull-Through",
    "| Criterion | Matched rows | Pull-through |",
    "| --- | ---: | ---: |",
    criteriaRows || "| No criteria | 0/0 | 0% |",
    "",
    "## Interpretation",
    `${strongestCopy} ${weakCopy} Treat high match counts as evidence that creators repeated or echoed the intended message; treat low match counts as gaps in visible post copy, not as proof that the audience missed the message.`,
    "",
    "## Evidence Highlights",
    highlights,
    "",
    "## Data Limits",
    "- Source base is the manually collected / already opened Threads posts only.",
    "- Matching is based on visible post text and configured criteria.",
    "- Views are only reported when visible or inferable from collected text; unavailable views are not estimated.",
    "- No reach, EAV, duplicate policy, or all-channel claim is made in this V1 summary."
  ].join("\n");
}

export function validatePrSummaryDraft(draft: string, facts: PrSummaryFacts): boolean {
  const lower = draft.toLowerCase();
  if (/\beav\b|earned media value|media value|all[-\s]?channel|across all channels|\breach(?:ed)?\b/.test(lower)) {
    return false;
  }
  const allowed = new Set<number>([
    facts.total_rows,
    facts.observed_metrics.likes,
    facts.observed_metrics.comments,
    facts.observed_metrics.reposts,
    facts.observed_metrics.views,
    facts.observed_metrics.views_rows_observed,
    ...facts.criteria.map((criterion) => criterion.matched_rows),
    ...facts.criteria.map((criterion) => Math.round(criterion.pull_through_rate * 100)),
    ...facts.top_rows.flatMap((row) => [row.likes, row.comments, row.matched_count])
  ]);
  const numbers = draft.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return numbers.every((token) => {
    const value = Number(token.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 6) {
      return true;
    }
    return [...allowed].some((allowedValue) => allowedValue > 0 && value <= allowedValue * 1.1);
  });
}

export function extractPrCoreMessages(briefText: string): string[] {
  const normalized = briefText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const messages: string[] = [];
  const push = (message: string) => {
    if (!messages.includes(message)) {
      messages.push(message);
    }
  };

  const campaignMatch = normalized.match(/「([^」]{4,48}(?:嘉年華|活動|體驗|計劃|campaign|event)[^」]{0,24})」/i)
    || normalized.match(/\b([A-Z][A-Za-z0-9 ]{2,40}(?:Campaign|Carnival|Festival|Event|Experience)[A-Za-z0-9 ]{0,24})\b/);
  if (campaignMatch?.[1]) {
    push(`Campaign identity: ${campaignMatch[1].trim()}`);
  }
  const hashtags = [...normalized.matchAll(/#[\p{L}\p{N}_-]+/gu)].map((match) => match[0]).slice(0, 4);
  if (hashtags.length) {
    push(`Social tags / campaign handles: ${hashtags.join(" ")}`);
  }
  if (/wellness|好狀態|全方位健康|身心/i.test(normalized)) {
    push("Core message: wellness is a holistic good-state covering body, emotion, appearance, sleep, and social connection.");
  }
  if (/可信賴|顧問|advisor|專業健康團隊|健康檢測|AI\s*頭髮|智能健康/i.test(normalized)) {
    push("Brand role: Mannings acts as a trusted all-round wellness advisor through professional advice, health checks, and technology-enabled services.");
  }
  if (/沉浸式|快閃|嘉年華|體驗|工作坊|舞台|市集|Play Zone|Breathing Corner/i.test(normalized)) {
    push("Experience proof: the campaign turns wellness from an abstract idea into participatory, immersive, and fun real-world experiences.");
  }
  if (/西九|文化區|4\s*月\s*25|4\s*月\s*26|25\s*至\s*26|兩日|一連兩日/i.test(normalized)) {
    push("Event mechanics: first large-scale BoostUP wellness carnival at WestK on 25-26 April 2026.");
  }
  if (/六大|6\s*大|40\s*(?:種|場)|50\s*位|主題區|健康專家|運動領袖/i.test(normalized)) {
    push("Scale proof: six themed zones, 40+ experiences, and 50+ wellness experts / community builders.");
  }
  if (/社區|連結|人人|家庭|朋友|年輕人|城市|community/i.test(normalized)) {
    push("Community message: wellness is accessible, social, and community-led rather than only expert or gym-driven.");
  }
  if (/門票|票價|早鳥|購票|https?:\/\//i.test(normalized)) {
    push("CTA / conversion message: ticketing, pricing, sale period, and purchase link are available for public participation.");
  }

  return messages.slice(0, 10);
}

export function buildDeterministicPrCriteria(campaignName: string, briefText: string): PrCampaign["criteria"] {
  const normalized = `${campaignName} ${briefText}`.replace(/\s+/g, " ").trim();
  const labels: string[] = [];
  const push = (label: string) => {
    if (!labels.includes(label)) {
      labels.push(label);
    }
  };

  if (campaignName.trim() || /BoostUP|萬寧|Mannings/i.test(normalized)) {
    push("Mentions Mannings BoostUP campaign");
  }
  if (/好狀態|wellness|全方位健康|身心/i.test(normalized)) {
    push("Connects to holistic wellness / 好狀態");
  }
  if (/可信賴|顧問|advisor|專業健康團隊|健康檢測|AI\s*頭髮|智能健康/i.test(normalized)) {
    push("Shows Mannings as trusted wellness advisor");
  }
  if (/沉浸式|快閃|嘉年華|體驗|工作坊|舞台|市集|Play Zone|Breathing Corner/i.test(normalized)) {
    push("References immersive carnival experience");
  }
  if (/西九|文化區|4\s*月\s*25|4\s*月\s*26|25\s*至\s*26|兩日|一連兩日/i.test(normalized)) {
    push("Includes WestK event date / location");
  }
  if (/六大|6\s*大|40\s*(?:種|場)|50\s*位|主題區|健康專家|運動領袖/i.test(normalized)) {
    push("Mentions six zones / 40+ experiences / experts");
  }
  if (/社區|連結|人人|家庭|朋友|年輕人|城市|community/i.test(normalized)) {
    push("Frames wellness as social / community-led");
  }
  if (/門票|票價|早鳥|購票|https?:\/\//i.test(normalized)) {
    push("Includes ticketing or participation CTA");
  }

  const fallback = [
    "Campaign / brand message appears",
    "Key campaign theme appears",
    "Experience or event proof appears",
    "Offer / product detail appears",
    "Audience relevance appears",
    "CTA or next action appears"
  ];
  for (const label of fallback) {
    push(label);
  }

  return PR_CRITERION_IDS.map((id, index) => ({
    id,
    label: labels[index] || `criterion_${index + 1}`
  })) as PrCampaign["criteria"];
}

export function buildPrCriteriaSuggestionPrompt(campaignName: string, briefText: string): string {
  const coreMessages = extractPrCoreMessages(briefText);
  return [
    "You are helping a PR operator turn a campaign brief into six reportable message criteria.",
    "Return exactly six short criteria labels as JSON.",
    "Each label must be matchable against a Threads post caption or visible post text.",
    "Prefer concrete campaign message pull-through over generic labels such as Brand named or CTA included when the brief has enough detail.",
    "Do not produce strategy advice. Do not invent performance numbers.",
    "",
    `Campaign: ${campaignName}`,
    coreMessages.length ? "Core PR messages detected from the brief:" : "Core PR messages detected from the brief: none",
    ...coreMessages.map((message) => `- ${message}`),
    "",
    `Brief: ${briefText || "(manual criteria allowed; infer generic PR reporting labels)"}`
  ].join("\n");
}

export function buildPrCriteriaMatchPrompt(campaign: PrCampaign, rows: PrEvidenceRow[]): string {
  return [
    "Match collected Threads posts against six PR report criteria.",
    "Return JSON only. For each known row_id, output booleans c1..c6. No explanation, no confidence, no quotes.",
    "",
    `Campaign: ${campaign.name}`,
    `Brief: ${campaign.briefText}`,
    "Criteria:",
    ...campaign.criteria.map((criterion) => `${criterion.id}: ${criterion.label}`),
    "",
    "Rows:",
    ...rows.map((row) => `${row.id}: ${row.caption}`)
  ].join("\n");
}

export function buildPrSummaryPrompt(facts: PrSummaryFacts): string {
  return [
    "Write a client-ready topline PR audit summary in Markdown from the facts only.",
    "Use these sections exactly: Executive Read, Message Pull-Through, Interpretation, Evidence Highlights, Data Limits.",
    "Do not dump full raw captions. Use short evidence excerpts only.",
    "Message Pull-Through must include a compact Markdown table with matched rows and percentages.",
    "Evidence Highlights should include at most 5 rows, each with why it is notable based only on matched criteria and observed interactions.",
    "Do not invent reach, EAV, media value, all-channel coverage, or any number not present in facts.",
    "Be facts-first and suitable for a PR operator to paste into a client audit memo.",
    JSON.stringify(facts, null, 2)
  ].join("\n");
}
