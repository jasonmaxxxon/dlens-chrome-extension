import { tokens, modeThemes } from "../ui/tokens";
const g = tokens.collectWheel;
const m = tokens.motion.collectWheel;

/** Scoped v9 button, wheel and toast; injected through the content script's head stylesheet. */
export const DLENS_INLINE_COLLECT_CSS = `
.dlens-collect-inline {display:inline-flex;align-items:center;flex:none;gap:${g.actionGap}px;margin-inline-start:auto}
.dlens-collect-button,.dlens-collect-chip,.dlens-collect-wheel,.dlens-collect-toast {
  --ease:${m.spring}; --ink:${tokens.color.ink}; --soft:${g.softInk}; --ui:${g.font}; box-sizing:border-box;
}
.dlens-collect-wheel *,.dlens-collect-toast *,.dlens-collect-button * {box-sizing:border-box}
.dlens-collect-button {position:relative;width:${g.buttonSize}px;height:${g.buttonSize}px;border:0;border-radius:50%;background:none;color:${g.buttonIcon};display:grid;place-items:center;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;flex:none;padding:0;pointer-events:auto}
.dlens-collect-button:hover {background:${g.buttonHover}}
.dlens-collect-button:focus-visible {outline:${g.focusWidth}px solid var(--ring,${modeThemes.topic.accent});outline-offset:${g.focusOffset}px}
.dlens-collect-button svg {width:${g.buttonIconSize}px;height:${g.buttonIconSize}px;transition:transform ${m.buttonTransformMs}ms ease}
.dlens-collect-button .bm {transition:fill ${m.buttonFillMs}ms,stroke ${m.buttonFillMs}ms}
.dlens-collect-button.saved {color:var(--acc)}
.dlens-collect-button.saved .bm {fill:var(--acc);stroke:var(--acc)}
.dlens-collect-button.saved .lens {stroke:${tokens.color.inverse}}
.dlens-collect-button.charging svg {transform:scale(${m.chargingScale})}
.dlens-collect-button .ring {position:absolute;inset:0;border-radius:50%;pointer-events:none;opacity:0;-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - ${g.ringMaskOuter}px),${g.maskBlack} calc(100% - ${g.ringMaskInner}px));mask:radial-gradient(farthest-side,transparent calc(100% - ${g.ringMaskOuter}px),${g.maskBlack} calc(100% - ${g.ringMaskInner}px));background:conic-gradient(var(--ring,${modeThemes.topic.accent}) var(--dlens-collect-charge),transparent 0)}
.dlens-collect-button.charging .ring {opacity:1;animation:dlens-collect-charge var(--hold,${g.hold}ms) linear forwards}
.dlens-collect-button .burst {position:absolute;inset:${g.burstInset}px;border-radius:50%;border:${g.burstBorder}px solid var(--acc,${modeThemes.topic.accent});opacity:0;pointer-events:none}
.dlens-collect-button.pop .burst {animation:dlens-collect-burst ${m.burstMs}ms ease-out}
.dlens-collect-button.pop svg {animation:dlens-collect-pop ${m.popMs}ms var(--ease)}
.dlens-collect-chip {border:0;cursor:pointer;font:${g.chipWeight} ${g.chipFont}px/1 var(--ui);color:var(--acc);padding:${g.chipPadding};border-radius:${g.pillRadius}px;margin-right:${g.chipMargin}px;white-space:nowrap;background:color-mix(in srgb,var(--acc) ${g.chipTintPercent}%,transparent);animation:dlens-collect-chip-in ${m.chipMs}ms var(--ease);pointer-events:auto}
.dlens-collect-chip[hidden] {display:none}
.dlens-collect-chip:hover {background:color-mix(in srgb,var(--acc) ${g.chipHoverPercent}%,transparent)}
.dlens-collect-wheel {position:fixed;z-index:${g.wheelLayer};pointer-events:none;transform:scale(${m.openScale});opacity:0;font-family:var(--ui);transition:transform ${m.openMs}ms var(--ease),opacity ${m.opacityMs}ms linear}
.dlens-collect-wheel[hidden] {display:none}
.dlens-collect-wheel.open {transform:scale(1);opacity:1}
.dlens-collect-wheel.sticky {pointer-events:auto;cursor:pointer}
.dlens-collect-wheel.closing {transform:scale(${m.closeScale});opacity:0;transition:transform ${m.closeMs}ms ease-in,opacity ${m.closeMs}ms linear}
.dlens-collect-wheel.commit {transform:translate(var(--fx),var(--fy)) scale(${m.flyScale});opacity:1;transition:transform ${m.openMs}ms ${m.flyEasing}}
.dlens-collect-wheel .wheel-glass {position:absolute;border-radius:50%;background:${g.glass};border:${g.glassBorderWidth}px solid ${g.glassBorder};backdrop-filter:${g.glassFilter};-webkit-backdrop-filter:${g.glassFilter};box-shadow:${g.glassShadow};transition:opacity ${m.glassOpacityMs}ms}
.dlens-collect-wheel .wheel-svg {position:absolute;inset:0;overflow:visible}
.dlens-collect-wheel .sector {transform-box:view-box;transform-origin:center;transform:translate(var(--px,0px),var(--py,0px)) scale(var(--s,${m.sectorScale}));opacity:0;transition:transform ${m.sectorMs}ms var(--ease),opacity ${m.sectorOpacityMs}ms linear;transition-delay:calc(var(--i) * ${m.staggerMs}ms)}
.dlens-collect-wheel .sector path {fill:var(--tint);stroke:var(--tint);stroke-width:${g.sectorStroke};stroke-linejoin:round;transition:fill ${m.opacityMs}ms,stroke ${m.opacityMs}ms}
.dlens-collect-wheel.open .sector {--s:1;opacity:1}
.dlens-collect-wheel .sector.sel {--px:var(--dx);--py:var(--dy)}
.dlens-collect-wheel .sector.sel path,.dlens-collect-wheel .sector.picked path {fill:var(--acc);stroke:var(--acc)}
.dlens-collect-wheel.open .sector.picked {--s:${m.pickedScale};--px:var(--dx2);--py:var(--dy2);transition-delay:0s}
.dlens-collect-wheel.commit .sector {opacity:0;transition-delay:0s}
.dlens-collect-wheel.commit .sector.picked {opacity:1;--s:1}
.dlens-collect-wheel.settled .sector,.dlens-collect-wheel.settled .lbl {transition-delay:0s}
.dlens-collect-wheel .lbl {position:absolute;width:${g.labelWidth}px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:${g.labelGap}px;color:var(--ink);transform:translate(-50%,-50%) translate(var(--px,0px),var(--py,0px)) scale(var(--s,${m.labelScale}));opacity:0;transition:transform ${m.sectorMs}ms var(--ease),opacity ${m.sectorOpacityMs}ms linear,color ${m.opacityMs}ms;transition-delay:calc(var(--i) * ${m.staggerMs}ms)}
.dlens-collect-wheel.open .lbl {--s:1;opacity:1}
.dlens-collect-wheel .lbl b {font-size:${g.labelFont}px;font-weight:${g.labelWeight};letter-spacing:${g.labelTracking};white-space:nowrap}
.dlens-collect-wheel .lbl small {font-size:${g.destinationFont}px;line-height:${g.destinationLineHeight};color:var(--soft);font-variant-numeric:tabular-nums;transition:color ${m.opacityMs}ms;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dlens-collect-wheel .lbl.cur small {color:var(--acc);font-weight:${g.labelWeight}}
.dlens-collect-wheel .lbl .ic {color:var(--acc);display:grid;transition:color ${m.opacityMs}ms}
.dlens-collect-wheel .lbl .ic svg {width:${g.labelIconSize}px;height:${g.labelIconSize}px}
.dlens-collect-wheel .lbl.sel,.dlens-collect-wheel .lbl.picked {--px:var(--dx);--py:var(--dy);color:${tokens.color.inverse}}
.dlens-collect-wheel .lbl.sel b,.dlens-collect-wheel .lbl.picked b {color:${tokens.color.inverse}}
.dlens-collect-wheel .lbl.sel .ic,.dlens-collect-wheel .lbl.sel small,.dlens-collect-wheel .lbl.picked .ic,.dlens-collect-wheel .lbl.picked small {color:${g.selectedDetail}}
.dlens-collect-wheel.commit .lbl {opacity:0;transition-delay:0s}
.dlens-collect-wheel .wheel-center {position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;background:${tokens.color.elevated};box-shadow:${g.centerShadow};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${g.centerPadding}px;transition:opacity ${m.glassOpacityMs}ms}
.dlens-collect-wheel.commit .wheel-center,.dlens-collect-wheel.commit .wheel-glass {opacity:0}
.dlens-collect-wheel .c-title {max-width:100%;font-size:${g.centerTitleFont}px;font-weight:${g.centerTitleWeight};line-height:${g.centerTitleLineHeight};color:var(--c-acc,var(--ink));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dlens-collect-wheel .c-sub {font-size:${g.centerSubFont}px;line-height:${g.centerSubLineHeight};color:var(--soft);margin-top:${g.centerSubMargin}px;font-variant-numeric:tabular-nums}
.dlens-collect-wheel .ptr {position:absolute;inset:-${g.pointerInset}px;border-radius:50%;pointer-events:none;opacity:var(--po,0);background:conic-gradient(from calc(var(--ang,0deg) - ${g.pointerHalfAngle}deg),var(--pc,${g.pointerColor}) 0 ${2*g.pointerHalfAngle}deg,transparent ${2*g.pointerHalfAngle}deg);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - ${g.pointerMask}px),${g.maskBlack} calc(100% - ${g.pointerMask}px));mask:radial-gradient(farthest-side,transparent calc(100% - ${g.pointerMask}px),${g.maskBlack} calc(100% - ${g.pointerMask}px))}
.dlens-collect-toast {position:fixed;left:50vw;bottom:${g.toastBottom}px;z-index:${g.toastLayer};display:flex;align-items:center;gap:${g.toastGap}px;padding:${g.toastPadding};border-radius:${g.pillRadius}px;background:${tokens.color.ink};color:${g.toastForeground};font:${g.toastWeight} ${g.toastFont}px/${g.toastLineHeight} var(--ui);box-shadow:${g.toastShadow};max-width:calc(100vw - ${g.toastMargin}px);transform:translate(-50%,${m.toastOffset}px);opacity:0;pointer-events:none;transition:transform ${m.toastTransformMs}ms var(--ease),opacity ${m.toastOpacityMs}ms}
.dlens-collect-toast.on {transform:translate(-50%,0);opacity:1;pointer-events:auto}
.dlens-collect-toast span {white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dlens-collect-toast b {color:${g.toastAccent};font-weight:${g.chipWeight}}
.dlens-collect-toast button {border:0;background:none;color:${g.toastAction};font:${g.chipWeight} ${g.labelFont}px var(--ui);padding:${g.chipPadding};border-radius:${g.pillRadius}px;cursor:pointer;white-space:nowrap;flex:none}
.dlens-collect-toast button:hover {background:${g.toastHover}}
@media(prefers-reduced-motion:reduce) {
  .dlens-collect-wheel[data-dlens-control],.dlens-collect-wheel[data-dlens-control].open,.dlens-collect-wheel[data-dlens-control].closing,.dlens-collect-wheel[data-dlens-control].commit {transform:none;transition:opacity ${m.reducedOpacityMs}ms linear !important}
  .dlens-collect-wheel[data-dlens-control].commit {opacity:0}
  .dlens-collect-wheel[data-dlens-control] .sector,.dlens-collect-wheel[data-dlens-control] .lbl {transition:opacity ${m.reducedOpacityMs}ms linear,color ${m.reducedOpacityMs}ms !important;transition-delay:0s !important}
  .dlens-collect-wheel[data-dlens-control] .sector {transform:none}
  .dlens-collect-wheel[data-dlens-control] .lbl {transform:translate(-50%,-50%)}
  .dlens-collect-button[data-dlens-control].pop svg,.dlens-collect-button[data-dlens-control].pop .burst,.dlens-collect-chip[data-dlens-control] {animation:none !important}
  .dlens-collect-button[data-dlens-control].charging .ring {animation-duration:${g.hold}ms !important;animation-iteration-count:1 !important}
  .dlens-collect-button[data-dlens-control] svg {transition:transform ${m.buttonTransformMs}ms ease !important}
  .dlens-collect-button[data-dlens-control] .bm {transition:fill ${m.buttonFillMs}ms,stroke ${m.buttonFillMs}ms !important}
  .dlens-collect-wheel[data-dlens-control] .sector path {transition:fill ${m.opacityMs}ms,stroke ${m.opacityMs}ms !important}
  .dlens-collect-wheel[data-dlens-control] .lbl small,.dlens-collect-wheel[data-dlens-control] .lbl .ic {transition:color ${m.opacityMs}ms !important}
  .dlens-collect-wheel[data-dlens-control] .wheel-center,.dlens-collect-wheel[data-dlens-control] .wheel-glass {transition:opacity ${m.glassOpacityMs}ms !important}
  .dlens-collect-toast[data-dlens-control] {transition:opacity ${m.reducedToastMs}ms !important}
}
`;
