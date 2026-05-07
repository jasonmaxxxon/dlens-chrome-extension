type PrBriefUploadFile = Pick<File, "name" | "size" | "type" | "text" | "arrayBuffer">;

export interface PrBriefUploadResult {
  text: string;
  inferredName: string;
  sourceKind: "text" | "pdf";
}

export const PR_BRIEF_UPLOAD_MAX_BYTES = 1_000_000;
export const PR_BRIEF_PDF_READ_TIMEOUT_MS = 8_000;

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.slice(index, index + chunkSize)));
  }
  return chunks.join("");
}

function binaryStringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function decodeUtf16BeHex(hex: string): string {
  let output = "";
  for (let index = 0; index + 3 < hex.length; index += 4) {
    const code = Number.parseInt(hex.slice(index, index + 4), 16);
    if (Number.isFinite(code)) {
      output += String.fromCharCode(code);
    }
  }
  return output;
}

function decodeLiteralPdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1");
}

function textJoin(previous: string, next: string): string {
  if (!previous) {
    return next;
  }
  if (!next) {
    return previous;
  }
  if (/[\p{Script=Han}）】」：，。！？、]$/u.test(previous) || /^[\p{Script=Han}（【「#]/u.test(next)) {
    return `${previous}${next}`;
  }
  if (/[A-Za-z0-9]$/.test(previous) && /^[A-Za-z0-9]/.test(next)) {
    return `${previous}${next}`;
  }
  return `${previous} ${next}`;
}

async function inflateWithBrowser(data: Uint8Array): Promise<string> {
  const Decompression = (globalThis as unknown as {
    DecompressionStream?: new (format: string) => {
      writable: WritableStream<Uint8Array>;
      readable: ReadableStream<Uint8Array>;
    };
  }).DecompressionStream;
  if (!Decompression) {
    throw new Error("PDF decompression is not available in this browser.");
  }

  let lastError: unknown = null;
  for (const format of ["deflate-raw", "deflate"]) {
    try {
      const source = new Blob([data as unknown as BlobPart]).stream();
      const inflated = await new Response(source.pipeThrough(new Decompression(format))).arrayBuffer();
      return bytesToBinaryString(new Uint8Array(inflated));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to decompress PDF stream.");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function decodePdfStream(body: string, inflateStream: (data: Uint8Array) => Promise<string>): Promise<string> {
  const match = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
  if (!match?.[1]) {
    return "";
  }
  const raw = binaryStringToBytes(match[1]);
  if (!/\/FlateDecode\b/.test(body)) {
    return match[1];
  }
  return inflateStream(raw);
}

function parsePdfObjects(binary: string): Map<string, string> {
  const objects = new Map<string, string>();
  for (const match of binary.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
    objects.set(match[1], match[2] || "");
  }
  return objects;
}

function parseToUnicodeMap(cmap: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const match of (block[1] || "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(match[1].toUpperCase(), decodeUtf16BeHex(match[2]));
    }
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const match of (block[1] || "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]/g)) {
      let code = Number.parseInt(match[1], 16);
      for (const destination of match[3].matchAll(/<([0-9A-Fa-f]+)>/g)) {
        map.set(code.toString(16).toUpperCase().padStart(match[1].length, "0"), decodeUtf16BeHex(destination[1]));
        code += 1;
      }
    }
    for (const match of (block[1] || "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const destinationStart = Number.parseInt(match[3], 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(destinationStart) || end < start || end - start > 2000) {
        continue;
      }
      for (let code = start; code <= end; code += 1) {
        map.set(code.toString(16).toUpperCase().padStart(match[1].length, "0"), String.fromCharCode(destinationStart + code - start));
      }
    }
  }

  return map;
}

function decodeHexPdfText(hex: string, unicodeMap: Map<string, string> | null): string {
  const normalized = hex.toUpperCase();
  if (!unicodeMap) {
    return /^[0-9A-F]{4,}$/.test(normalized) ? decodeUtf16BeHex(normalized) : bytesToBinaryString(new Uint8Array(normalized.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) || []));
  }

  let output = "";
  for (let index = 0; index < normalized.length;) {
    const four = normalized.slice(index, index + 4);
    if (four.length === 4 && unicodeMap.has(four)) {
      output += unicodeMap.get(four);
      index += 4;
      continue;
    }
    const two = normalized.slice(index, index + 2);
    output += two ? String.fromCharCode(Number.parseInt(two, 16)) : "";
    index += 2;
  }
  return output;
}

function extractTextFromBlock(block: string, fontMaps: Record<string, Map<string, string> | null>): string {
  let currentFont: Map<string, string> | null = null;
  let text = "";
  const tokenPattern = /\/(F\d+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>|\(([^()]*)\)/g;
  for (const match of block.matchAll(tokenPattern)) {
    if (match[1]) {
      currentFont = fontMaps[match[1]] || null;
      continue;
    }
    if (match[2]) {
      text = textJoin(text, decodeHexPdfText(match[2], currentFont));
      continue;
    }
    if (match[3] !== undefined) {
      text = textJoin(text, decodeLiteralPdfString(match[3]));
    }
  }
  return text.trim();
}

function cleanExtractedPdfText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractPdfTextFromBytes(
  bytes: Uint8Array,
  options: { inflateStream?: (data: Uint8Array) => Promise<string> } = {}
): Promise<string> {
  const binary = bytesToBinaryString(bytes);
  const objects = parsePdfObjects(binary);
  const inflateStream = options.inflateStream || inflateWithBrowser;
  const streamCache = new Map<string, string>();

  async function decodedObjectStream(objectId: string): Promise<string> {
    if (streamCache.has(objectId)) {
      return streamCache.get(objectId) || "";
    }
    const decoded = await decodePdfStream(objects.get(objectId) || "", inflateStream).catch(() => "");
    streamCache.set(objectId, decoded);
    return decoded;
  }

  const objectToUnicode = new Map<string, Map<string, string>>();
  for (const [objectId, body] of objects.entries()) {
    const toUnicode = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!toUnicode?.[1]) {
      continue;
    }
    const cmap = await decodedObjectStream(toUnicode[1]);
    objectToUnicode.set(objectId, parseToUnicodeMap(cmap));
  }

  const pages = [...objects.entries()].filter(([, body]) => /\/Type\s*\/Page\b/.test(body));
  const lines: string[] = [];

  for (const [, pageBody] of pages) {
    const fontMaps: Record<string, Map<string, string> | null> = {};
    const fontBlock = pageBody.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (fontBlock?.[1]) {
      for (const font of fontBlock[1].matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
        fontMaps[font[1]] = objectToUnicode.get(font[2]) || null;
      }
    }

    const contentIds = [...pageBody.matchAll(/\/Contents\s+(?:\[(.*?)\]|(\d+\s+0\s+R))/g)]
      .flatMap((match) => [...(match[1] || match[2] || "").matchAll(/(\d+)\s+0\s+R/g)].map((entry) => entry[1]));

    let previousY: number | null = null;
    let currentLine = "";
    for (const contentId of contentIds) {
      const content = await decodedObjectStream(contentId);
      for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
        const blockText = extractTextFromBlock(block[1] || "", fontMaps);
        if (!blockText) {
          continue;
        }
        const matrix = [...(block[1] || "").matchAll(/[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+Tm/g)].at(-1);
        const y = matrix ? Number(matrix[2]) : null;
        if (previousY !== null && y !== null && Math.abs(previousY - y) > 2) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = "";
        }
        currentLine = textJoin(currentLine, blockText);
        previousY = y;
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    lines.push("");
  }

  return cleanExtractedPdfText(lines.join("\n"));
}

export function isSupportedPrBriefFile(file: Pick<File, "name" | "type">): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf"
    || file.type.startsWith("text/")
    || /\.(txt|md|markdown|text|pdf)$/i.test(name);
}

export async function readPrBriefFile(file: PrBriefUploadFile): Promise<PrBriefUploadResult> {
  if (file.size > PR_BRIEF_UPLOAD_MAX_BYTES) {
    throw new Error(`檔案太大（${(file.size / 1024).toFixed(0)} KB），請上傳 1 MB 以內的 press release。`);
  }
  if (!isSupportedPrBriefFile(file)) {
    throw new Error("只支援 PDF、.txt 或 .md press release。");
  }

  const inferredName = file.name.replace(/\.[^.]+$/, "");
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const text = await withTimeout(
      extractPdfTextFromBytes(new Uint8Array(await file.arrayBuffer())),
      PR_BRIEF_PDF_READ_TIMEOUT_MS,
      "PDF 讀取逾時。請改用可選取文字的 PDF、.txt 或直接貼上 brief。"
    );
    if (!text || text.length < 40) {
      throw new Error("這份 PDF 未能抽出足夠文字，請改用可選取文字的 PDF、.txt 或直接貼上 brief。");
    }
    return { text, inferredName, sourceKind: "pdf" };
  }

  const text = (await file.text()).replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new Error("檔案內容為空。");
  }
  return { text, inferredName, sourceKind: "text" };
}
