import { useEffect, useRef, useState } from "react";

export type AgentBriefCopyStatus = "idle" | "copied" | "error";

/** Own the clipboard side effect and ignore completion for a replaced reading. */
export function useAgentBriefClipboard(brief: string) {
  const [copyStatus, setCopyStatus] = useState<AgentBriefCopyStatus>("idle");
  const currentBrief = useRef(brief);
  const request = useRef(0);
  currentBrief.current = brief;
  useEffect(() => {
    request.current += 1;
    setCopyStatus("idle");
    return () => { request.current += 1; };
  }, [brief]);
  const copy = () => {
    const token = ++request.current;
    const finish = (status: AgentBriefCopyStatus) => {
      if (request.current === token && currentBrief.current === brief) setCopyStatus(status);
    };
    if (!brief || typeof navigator === "undefined" || !navigator.clipboard) {
      finish("error");
      return;
    }
    void navigator.clipboard.writeText(brief).then(() => finish("copied"), () => finish("error"));
  };
  return { copyStatus, copy };
}
