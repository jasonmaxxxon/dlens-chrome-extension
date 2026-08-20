import type { ProductContext } from "../state/types.ts";

export interface SignalReadingComment {
  ref: string;
  author: string;
  text: string;
  likeCount?: number | null;
}

export interface SignalReadingInput {
  signalId: string;
  rootText?: string;
  assembledContent: string;
  postUrl: string;
  representativeComments: SignalReadingComment[];
  productContext: ProductContext;
  productContextHash: string;
  analysisPromptVersion: string;
  existingAnalysisSummary: string;
}

/** Trimmed copy of the source material a reading was built from — stored for tracing. */
export interface SignalReadingSourcePacket {
  rootText?: string;
  assembledContent: string;
  postUrl: string;
  representativeComments: SignalReadingComment[];
  analysisPromptVersion: string;
}

const STORED_SOURCE_PACKET_ASSEMBLED_CAP = 8000;
const STORED_SOURCE_PACKET_COMMENT_CAP = 500;

/**
 * Build the trimmed source packet persisted with a reading record. Conservative caps
 * keep chrome.storage.local predictable even with unlimitedStorage; the full
 * content identity is preserved by sourcePacketHash, not by this stored copy.
 */
export function buildStoredSourcePacket(input: SignalReadingInput): SignalReadingSourcePacket {
  return {
    ...(typeof input.rootText === "string" ? { rootText: input.rootText } : {}),
    assembledContent: input.assembledContent.slice(0, STORED_SOURCE_PACKET_ASSEMBLED_CAP),
    postUrl: input.postUrl,
    representativeComments: input.representativeComments.map((comment) => ({
      ref: comment.ref,
      author: comment.author,
      text: comment.text.slice(0, STORED_SOURCE_PACKET_COMMENT_CAP),
      likeCount: typeof comment.likeCount === "number" && Number.isFinite(comment.likeCount) ? comment.likeCount : null
    })),
    analysisPromptVersion: input.analysisPromptVersion
  };
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function buildSourcePacketHash(input: SignalReadingInput): string {
  const parts = [
    input.postUrl,
    input.assembledContent,
    ...input.representativeComments.map((comment) => `${comment.ref}:${comment.likeCount ?? ""}:${comment.text}`),
    input.analysisPromptVersion
  ];
  return hashString(parts.join(""));
}
