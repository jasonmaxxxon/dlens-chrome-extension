import type { PrCampaignDraft, PrEvidenceRow } from "../state/pr-evidence-storage";
import { createDraftPrCampaign } from "../state/pr-evidence-storage";
import type { PrEvidenceResourceState } from "../viewmodel/pr-evidence";

export type { PrEvidenceResourceState } from "../viewmodel/pr-evidence";

export function createPrEvidenceResource(sessionId: string): PrEvidenceResourceState {
  return {
    campaign: createDraftPrCampaign(sessionId) satisfies PrCampaignDraft,
    rows: [],
    summary: "",
    notice: "",
    uploadError: "",
    setupCollapsed: false
  };
}
