import { Component, type ErrorInfo, type ReactNode } from "react";
import { getWorkspaceCrashMessage } from "./runtime-guard";
import { tokens } from "./tokens";

interface WorkspaceErrorBoundaryProps { children: ReactNode }
interface WorkspaceErrorBoundaryState { error: unknown }

/** The optional command must retry a real owner; standalone descriptions have no inert button. */
export function WorkspaceErrorFallback({ error, onReset }: { error: unknown; onReset?: () => void }) {
  const message = getWorkspaceCrashMessage(error);
  const p = tokens.panel;
  return <div data-dlens-react-error-boundary="true" role="alert" style={{ display: "grid", gap: p.space.sm, padding: p.space.md,
    borderRadius: p.radius.md, background: p.surface, color: p.ink, boxShadow: p.shadow.card, fontFamily: tokens.font.sans, minWidth: 0 }}>
    <h2 style={{ ...p.type.heading, margin: 0, color: p.danger }}>側欄出咗問題</h2>
    <p style={{ ...p.type.bodySm, margin: 0, color: p.ink2, overflowWrap: "anywhere" }}>{message}</p>
    {onReset ? <button type="button" data-workspace-error-reset="" onClick={onReset} style={{ ...p.type.meta, fontFamily: tokens.font.sans, justifySelf: "start", height: p.size.button,
      padding: `0 ${p.space.md}px`, border: `1px solid ${p.border}`, borderRadius: p.radius.sm, background: p.surface, color: p.accent, cursor: "pointer" }}>重新載入</button> : null}
  </div>;
}

export class WorkspaceErrorBoundary extends Component<WorkspaceErrorBoundaryProps, WorkspaceErrorBoundaryState> {
  state: WorkspaceErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: unknown): WorkspaceErrorBoundaryState { return { error }; }
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[DLens] React workspace render error", error, info.componentStack);
  }
  render() {
    if (this.state.error) return <WorkspaceErrorFallback error={this.state.error} onReset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
