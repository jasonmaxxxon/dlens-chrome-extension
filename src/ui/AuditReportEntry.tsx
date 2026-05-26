import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import type { EvidencePacket, TopicAuditReport } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { ExtensionResponse } from "../state/messages.ts";
import { AuditReportView, auditReportViewTestables } from "./AuditReportView.tsx";
import { sendExtensionMessage } from "./controller.tsx";

function readTopicId(): string {
  return new URLSearchParams(window.location.search).get("topicId") || "";
}

function AuditReportPage() {
  const [topicId] = useState(readTopicId);
  const [report, setReport] = useState<TopicAuditReport | null>(null);
  const [packets, setPackets] = useState<EvidencePacket[]>([]);
  const [flags, setFlags] = useState<TopicAuditValidationFlag[]>([]);

  useEffect(() => {
    if (!topicId) {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<ExtensionResponse>({ type: "topic/audit/get", topicId })
      .then(async (response) => {
        if (cancelled || !response.ok) {
          return;
        }
        setReport(response.auditReport ?? null);
        setPackets(response.auditEvidence ?? []);
        if (response.auditReport) {
          const validateResponse = await sendExtensionMessage<ExtensionResponse>({ type: "topic/audit/validate", topicId });
          if (!cancelled && validateResponse.ok) {
            setFlags(validateResponse.auditValidatorFlags ?? []);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  return (
    <AuditReportView
      topicId={topicId}
      report={report}
      packets={packets}
      flags={flags}
      onCopyMarkdown={(markdown) => {
        void navigator.clipboard?.writeText(markdown || (report ? auditReportViewTestables.serializeReportMarkdown(report, flags) : ""));
      }}
    />
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Audit report root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuditReportPage />
  </React.StrictMode>
);
