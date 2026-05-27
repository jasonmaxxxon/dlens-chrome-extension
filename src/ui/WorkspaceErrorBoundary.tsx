import { Component, type ErrorInfo, type ReactNode } from "react";

import { getWorkspaceCrashMessage } from "./runtime-guard";
import { tokens } from "./tokens";

interface WorkspaceErrorBoundaryProps {
  children: ReactNode;
}

interface WorkspaceErrorBoundaryState {
  error: unknown;
}

export function WorkspaceErrorFallback({ error }: { error: unknown }) {
  const message = getWorkspaceCrashMessage(error);
  return (
    <div
      data-dlens-react-error-boundary="true"
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderRadius: tokens.radius.card,
        border: `1px solid ${tokens.color.failedSoft}`,
        background: tokens.color.failedSoft,
        color: tokens.color.ink,
        boxShadow: tokens.shadow.card
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: tokens.color.failed }}>
        DLens hit a render error.
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: tokens.color.subInk }}>
        {message}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.55, color: tokens.color.softInk }}>
        Reload the page or reopen the popup. The workspace is showing this fallback instead of disappearing.
      </div>
    </div>
  );
}

export class WorkspaceErrorBoundary extends Component<WorkspaceErrorBoundaryProps, WorkspaceErrorBoundaryState> {
  state: WorkspaceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): WorkspaceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[DLens] React workspace render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <WorkspaceErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
