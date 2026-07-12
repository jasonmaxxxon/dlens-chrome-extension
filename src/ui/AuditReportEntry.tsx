import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import type { EvidencePacket, TopicAuditReport } from "../compare/topic-audit.ts";
import type { TopicAuditValidationFlag } from "../compare/topic-audit-validator.ts";
import type { ExtensionResponse } from "../state/messages.ts";
import { isTopicAuditPublicationCompatible, type TopicAuditMemoBundle } from "../state/topic-audit-storage.ts";
import { AuditReportView, auditReportViewTestables } from "./AuditReportView.tsx";
import { sendExtensionMessage } from "./controller.tsx";
import { ensureDlensKeyframes } from "./motion.ts";

function readTopicId(): string {
  return new URLSearchParams(window.location.search).get("topicId") || "";
}

function AuditReportPage() {
  const [topicId] = useState(readTopicId);
  const [report, setReport] = useState<TopicAuditReport | null>(null);
  const [packets, setPackets] = useState<EvidencePacket[]>([]);
  const [auditMemos, setAuditMemos] = useState<TopicAuditMemoBundle | null>(null);
  const [flags, setFlags] = useState<TopicAuditValidationFlag[]>([]);

  useEffect(() => {
    if (!topicId) {
      return;
    }
    let cancelled = false;
    void sendExtensionMessage<ExtensionResponse>({ type: "topic/audit/get", topicId })
      .then((response) => {
        if (cancelled || !response.ok) {
          return;
        }
        const nextPackets = response.auditEvidence ?? [];
        const nextMemos = response.auditMemos ?? null;
        const nextReport = response.auditReport ?? null;
        const compatible = isTopicAuditPublicationCompatible(nextReport, nextMemos, nextPackets);
        setReport(compatible ? nextReport : null);
        setPackets(nextPackets);
        setAuditMemos(nextMemos);
        setFlags(compatible ? response.auditValidatorFlags ?? [] : []);
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
      auditMemos={auditMemos}
      flags={flags}
      onCopyMarkdown={(markdown) => {
        void navigator.clipboard?.writeText(markdown || (report ? auditReportViewTestables.serializeReportMarkdown(report, flags) : ""));
      }}
    />
  );
}

ensureDlensKeyframes(document);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Audit report root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuditReportPage />
  </React.StrictMode>
);
