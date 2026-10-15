/** Model aliases belong only in structured refs, never in the reader's prose. */
export function cleanReadingCopy(value: unknown): string {
  return typeof value === 'string' ? value
    .replace(/\b(?:p\d+(?:\.r\d+)?|[er]\d+)\b/g, '')
    .replace(/[（(\[]\s*[）)\]]/g, '')
    .replace(/\s+/g, ' ').trim() : '';
}
/** Retain a complete sentence or clause. An unbroken overlong label is omitted. */
export function clipReadingCopy(value: unknown, cap: number): string {
  const text = cleanReadingCopy(value);
  if (text.length <= cap) return text;
  const prefix = text.slice(0, cap);
  const sentence = [...prefix.matchAll(/[。！？!?]|\.(?=\s|$)/g)].at(-1);
  if (sentence) return prefix.slice(0, sentence.index! + 1).trim();
  const clause = [...prefix.matchAll(/[，,；;：:、]/g)].at(-1);
  if (clause) return prefix.slice(0, clause.index).trim();
  // Whitespace bounds a complete Latin word; CJK without punctuation has no safe clause.
  const word = prefix.lastIndexOf(' ');
  return word > 0 ? prefix.slice(0, word).trim() : '';
}
/** A cluster name is an atomic label, so an oversized one is omitted, never abbreviated. */
export function readingLabel(value: unknown, cap: number): string {
  const text = cleanReadingCopy(value);
  return text.length <= cap ? text : '';
}
