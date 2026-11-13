import type { AnalysisBlocksModel, PostTypeKey } from "../viewmodel/analysis-blocks";
import { useBlockText } from "./i18n";
import { tokens } from "./tokens";
const p = tokens.panel;
type T = ReturnType<typeof useBlockText>;
const tile = { background: p.surface, borderRadius: p.radius.lg, boxShadow: p.shadow.card, padding: p.space.lg, minWidth: 0 };

export function PostTypeTag({ type }: { type: PostTypeKey }) {
  const t = useBlockText();
  return <span data-post-type={type} aria-label={`${t("blocks.post_type.label")}：${t(`blocks.post_type.${type}`)}`} style={{ ...p.type.micro, fontWeight: 600, display: "inline-flex", alignItems: "center", padding: `${p.space.xxs}px ${p.space.sm}px`, borderRadius: p.radius.pill, background: p.accentSoft, color: p.ink, whiteSpace: "nowrap" }}>{t(`blocks.post_type.${type}`)}</span>;
}

const omittedLine = (t: T, o: { type: string; reason: string }) => t(o.reason === "empty" ? "blocks.omitted.item" : `blocks.omitted.${o.reason}`, { title: t(`blocks.${o.type}.title`) || t("blocks.post_type.unknown") });

/** Non-blocking notices: a failed block build, or blocks present but none to show. */
export function BlocksNotice({ model }: { model: AnalysisBlocksModel }) {
  const t = useBlockText();
  if (model.mode === "empty") return <div data-blocks-empty="" role="status" style={{ ...tile, marginTop: p.space.md }}>
    <b style={{ ...p.type.bodySm, fontWeight: 600, color: p.ink }}>{t("blocks.empty.title")}</b>
    {model.omitted.length ? <ul style={{ margin: `${p.space.xs}px 0 0`, paddingLeft: p.space.lg, ...p.type.bodySm, color: p.ink3 }}>{model.omitted.map((o, i) => <li key={i} data-block-omitted={o.type} data-block-omitted-reason={o.reason}>{omittedLine(t, o)}</li>)}</ul>
      : <p style={{ ...p.type.bodySm, color: p.ink3, margin: `${p.space.xs}px 0 0` }}>{t("blocks.empty.none")}</p>}
  </div>;
  if (!model.error) return null;
  return <p data-blocks-error="" role="status" style={{ ...p.type.bodySm, margin: `${p.space.md}px 0 0`, padding: `${p.space.xs}px ${p.space.sm}px`, borderRadius: p.radius.xs, background: p.warningSoft, color: p.warning }}>{t("blocks.error.fallback")}</p>;
}
