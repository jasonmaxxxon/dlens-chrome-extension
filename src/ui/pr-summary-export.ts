import {
  buildPrSummaryDocxExport,
  buildPrSummaryMarkdownExport,
  type PrFileExportDescriptor
} from "../compare/pr-summary-export.ts";

export function downloadPrFileExport(file: PrFileExportDescriptor): void {
  const content = typeof file.content === "string"
    ? file.content
    : file.content.buffer.slice(file.content.byteOffset, file.content.byteOffset + file.content.byteLength) as ArrayBuffer;
  const blob = new Blob([content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportPrSummaryMarkdown(summary: string, campaignName: string): void {
  downloadPrFileExport(buildPrSummaryMarkdownExport(summary, campaignName));
}

export function exportPrSummaryDocx(summary: string, campaignName: string): void {
  downloadPrFileExport(buildPrSummaryDocxExport(summary, campaignName));
}
