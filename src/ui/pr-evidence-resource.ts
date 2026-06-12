import type { PrCampaign, PrEvidenceRow } from "../state/pr-evidence-storage";
import { createDraftPrCampaign } from "../state/pr-evidence-storage";

export interface PrEvidenceResourceState {
  campaign: PrCampaign;
  rows: PrEvidenceRow[];
  summary: string;
  notice: string;
  uploadError: string;
  setupCollapsed: boolean;
}

export function createPrEvidenceResource(sessionId: string): PrEvidenceResourceState {
  return {
    campaign: createDraftPrCampaign(sessionId),
    rows: [],
    summary: "",
    notice: "",
    uploadError: "",
    setupCollapsed: false
  };
}
