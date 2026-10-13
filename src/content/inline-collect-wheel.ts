import type { TargetDescriptor } from "../contracts/target-descriptor";
import type { FolderMode } from "../state/types";
import { modeThemes, tokens } from "../ui/tokens";
import { buildTopicRing, hitTopicRing, clampWheelCenter, topicWheelText, type TopicRingSegment, buildWheelGeometry, idxFrom, releaseGesture, sectorPath, selectGesture as selectionCoordinates, tMid, type GestureMode } from "./inline-collect-wheel-math";
export { DLENS_INLINE_COLLECT_CSS } from "./inline-collect-wheel-styles";
const g = tokens.collectWheel, m = tokens.motion.collectWheel;
const svg = (body: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const INLINE_COLLECT_BUTTON_HTML = svg('<path class="bm" d="M7 3.8h10a1 1 0 0 1 1 1V20l-6-3.8L6 20V4.8a1 1 0 0 1 1-1z"/><circle class="lens" cx="12" cy="9.6" r="2.3"/>') + '<span class="ring"></span><span class="prog"></span><span class="dot"></span><span class="burst"></span>';
export const COLLECT_WHEEL_TARGETS = [
  { mode: "topic", name: "觀眾反應", desc: "看大家點回應", icon: svg('<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>') },
  { mode: "product", name: "個人應用", desc: "對我有咩用", icon: svg('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9"/>') },
  { mode: "pr-evidence", name: "活動追蹤", desc: "核對訊息、記錄數字", icon: svg('<path d="M12 3 5 6v5c0 4.4 3 8.2 7 10 4-1.8 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/>') },
  { mode: "archive", name: "收藏整理", desc: "放好，唔分析", icon: svg('<path d="M4 6.5h16v3.5H4zM5.5 10v9h13v-9M10 13.5h4"/>') }
] as const;
export interface InlineCollectPost {
  identity: string;
  button: HTMLButtonElement;
  chip: HTMLButtonElement;
  descriptor: TargetDescriptor;
}
export interface InlineCollectDestination {
  mode: FolderMode;
  sessionId: string | null;
  sessionName: string;
}
export interface InlineWheelTopic { id: string; name: string; count: number }
export interface InlineCollectWheelOptions {
  getTopics?: () => readonly InlineWheelTopic[];
  overlayRoot: HTMLElement;
  getDestinations: () => readonly InlineCollectDestination[];
  getLastMode: () => FolderMode;
  getSavedMode: (identity: string) => FolderMode | null;
  getHoveredPost: () => InlineCollectPost | null;
  onSave: (post: InlineCollectPost, mode: FolderMode, options: {
    popDelay: number;
    topicId?: string;
    topicSessionId?: string | null;
    pickTopic?: boolean;
  }) => void;
  onTap: (post: InlineCollectPost) => void;
}
const buttonVersions = new WeakMap<HTMLButtonElement, number>();
const buttonStates = new WeakMap<HTMLButtonElement, string>();
/** Visual acknowledgement happens synchronously; callers own persistence and roll back errors. */
export function updateSavedButton(post: InlineCollectPost, mode: FolderMode | null, name = "", options: {
  popDelay?: number;
  quiet?: boolean;
} = {}): void {
  const { button, chip } = post;
  const nextState = `${mode ?? ""}:${name}`;
  if (options.quiet && buttonStates.get(button) === nextState) {
    return;
  }
  buttonStates.set(button, nextState);
  const version = (buttonVersions.get(button) ?? 0) + 1;
  buttonVersions.set(button, version);
  button.classList.toggle("saved", mode !== null);
  button.setAttribute("aria-pressed", String(mode !== null));
  button.setAttribute("aria-label", mode ? `從「${name}」移除收藏；按住選擇其他工作區` : "收藏到工作區；按住選擇工作區");
  chip.hidden = mode === null;
  if (!mode) {
    button.classList.remove("pop");
    return;
  }
  const color = modeThemes[mode].accent;
  button.style.setProperty("--acc", color);
  chip.style.setProperty("--acc", color);
  chip.textContent = `✓ ${name}`;
  chip.title = name;
  if (options.quiet) {
    return;
  }
  const pop = () => {
    if (!button.isConnected || buttonVersions.get(button) !== version) {
      return;
    }
    button.classList.remove("pop");
    void button.offsetWidth;
    button.classList.add("pop");
  };
  if (options.popDelay) {
    button.ownerDocument.defaultView?.setTimeout(pop, options.popDelay);
  } else {
    pop();
  }
  chip.style.animation = "none";
  void chip.offsetWidth;
  chip.style.animation = "";
}
/** DOM controller only: no storage or extension APIs. One instance uses the existing fixed overlay root. */
export function createInlineCollectWheel(options: InlineCollectWheelOptions) {
  const doc = options.overlayRoot.ownerDocument, win = doc.defaultView!;
  const geom = buildWheelGeometry();
  const wheel = doc.createElement("div"), toast = doc.createElement("div");
  wheel.className = "dlens-collect-wheel";
  wheel.hidden = true;
  wheel.dataset.dlensControl = "true";
  wheel.dataset.dlensWheelRoot = "true";
  wheel.setAttribute("role", "menu");
  wheel.setAttribute("aria-label", "收藏去向");
  wheel.innerHTML = '<div class="wheel-glass"></div><svg class="wheel-svg" aria-hidden="true"></svg><div class="wheel-labels"></div><div class="topic-arc"></div><div class="wheel-center"><div class="ptr"></div><div class="c-title"></div><div class="c-sub"></div></div>';
  toast.className = "dlens-collect-toast";
  toast.dataset.dlensControl = "true";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.inert = true;
  options.overlayRoot.append(wheel, toast);
  const $ = <T extends Element = HTMLElement>(selector: string) => wheel.querySelector<T>(selector)!;
  let sectors: SVGGElement[] = [], labels: HTMLElement[] = [];
  type Gesture = {
    post: InlineCollectPost;
    source: "pointer" | "key";
    pid: number | null;
    ox: number;
    oy: number;
    lx: number;
    ly: number;
    opened: boolean;
    mode: GestureMode | null;
    timer: number;
  };
  type OpenWheel = {
    post: InlineCollectPost;
    cx: number;
    cy: number;
    sticky: boolean;
    sel: number;
    locked?: boolean;
    arcOpen?: boolean;
    arcRequested?: boolean;
    topics?: readonly InlineWheelTopic[];
    segments?: TopicRingSegment[];
    topicIndex?: number | null;
    topicSessionId?: string | null;
    topicSnapshot?: string;
  };
  let G: Gesture | null = null, W: OpenWheel | null = null;
  let closeTimer = 0, settledTimer = 0, toastTimer = 0, arcTimer = 0;
  let arcHintShown = false;
  let lastMouse = { x: win.innerWidth / 2, y: win.innerHeight / 2 };
  let generation = 0;
  const timers = new Set<number>(), bindings = new Set<() => void>();
  const later = (fn: () => void, ms: number) => {
    const epoch = generation;
    const id = win.setTimeout(() => {
      timers.delete(id);
      if (epoch === generation) {
        fn();
      }
    }, ms);
    timers.add(id);
    return id;
  };
  const clear = (id: number) => {
    win.clearTimeout(id);
    timers.delete(id);
  };
  const reduced = () => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const coords = (gesture: Gesture, x = gesture.lx, y = gesture.ly) => ({ mode: gesture.mode, origin: { x: gesture.ox, y: gesture.oy }, pointer: { x, y }, center: { x: W?.cx ?? gesture.ox, y: W?.cy ?? gesture.oy } });
  function buildWheel() {
    const { R, r0, S, c } = geom;
    wheel.style.width = wheel.style.height = `${S}px`;
    Object.assign($(".wheel-glass").style, { left: `${c - R - g.glassMargin}px`, top: `${c - R - g.glassMargin}px`, width: `${2 * (R + g.glassMargin)}px`, height: `${2 * (R + g.glassMargin)}px` });
    const wheelSvg = $<SVGSVGElement>(".wheel-svg");
    wheelSvg.setAttribute("viewBox", `0 0 ${S} ${S}`);
    wheelSvg.setAttribute("width", String(S));
    wheelSvg.setAttribute("height", String(S));
    wheelSvg.innerHTML = COLLECT_WHEEL_TARGETS.map((t, i) => {
      const mid = tMid(i), a = mid * Math.PI / 180, col = modeThemes[t.mode].accent;
      return `<g class="sector" data-i="${i}" style="--i:${i};--acc:${col};--tint:color-mix(in srgb,${col} ${g.tintPercent}%,${g.tintBase});--dx:${(Math.cos(a) * g.sectorShift).toFixed(2)}px;--dy:${(Math.sin(a) * g.sectorShift).toFixed(2)}px;--dx2:${(Math.cos(a) * g.sectorPickedShift).toFixed(2)}px;--dy2:${(Math.sin(a) * g.sectorPickedShift).toFixed(2)}px"><path d="${sectorPath(c, r0 + g.sectorInset, R - g.sectorInset, mid - 45, mid + 45, g.sectorGap)}"/></g>`;
    }).join("");
    const rl = (r0 + R) / 2 + g.labelOffset;
    $(".wheel-labels").innerHTML = COLLECT_WHEEL_TARGETS.map((t, i) => {
      const a = tMid(i) * Math.PI / 180;
      return `<div class="lbl" data-i="${i}" role="menuitem" style="left:${(c + rl * Math.cos(a)).toFixed(1)}px;top:${(c + rl * Math.sin(a)).toFixed(1)}px;--i:${i};--acc:${modeThemes[t.mode].accent};--dx:${(Math.cos(a) * g.sectorShift).toFixed(2)}px;--dy:${(Math.sin(a) * g.sectorShift).toFixed(2)}px"><span class="ic">${t.icon}</span><b>${t.name}</b><small></small></div>`;
    }).join("");
    sectors = Array.from(wheelSvg.querySelectorAll(".sector"));
    labels = Array.from(wheel.querySelectorAll(".lbl"));
    $(".wheel-center").style.width = $(".wheel-center").style.height = `${2 * (r0 - g.centerInset)}px`;
  }
  function populate(post: InlineCollectPost) {
    COLLECT_WHEEL_TARGETS.forEach((t, i) => {
      labels[i].classList.toggle("cur", options.getSavedMode(post.identity) === t.mode);
      const name = options.getDestinations().find(d => d.mode === t.mode)?.sessionName ?? t.name;
      labels[i].querySelector("small")!.textContent = name;
      labels[i].title = name;
    });
  }
  function centerText(idx: number) {
    if (!W) {
      return;
    }
    const title = $(".c-title"), sub = $(".c-sub");
    if (idx >= 0) {
      const t = COLLECT_WHEEL_TARGETS[idx];
      title.textContent = t.name;
      sub.textContent = idx === 0 ? topicWheelText(W.topicIndex != null ? { name: W.topics?.[W.topicIndex]?.name ?? "其他話題", more: W.segments?.[W.topicIndex]?.more ?? false } : null).sub : t.desc;
      // Keep the complete destination within two lines, including unusually long topic names.
      const available = 2 * (geom.r0 - g.centerInset) - 2 * g.centerPadding;
      sub.style.fontSize = `${Math.min(g.centerSubFont, 2 * available / Math.max(1, [...sub.textContent].length))}px`;
      wheel.style.setProperty("--c-acc", modeThemes[t.mode].accent);
      return;
    }
    wheel.style.setProperty("--c-acc", "var(--ink)");
    sub.style.fontSize = "";
    const metrics = W.post.descriptor.engagement;
    title.textContent = W.sticky ? "點一格" : metrics.comments === null ? "選擇工作區" : `${metrics.comments} 則留言`;
    sub.textContent = W.sticky ? "Esc 取消" : metrics.likes === null ? "放開收藏" : `${metrics.likes} 讚`;
  }
  function setSel(idx: number) {
    if (!W || idx === W.sel) {
      return;
    }
    W.sel = idx;
    sectors.forEach((el, i) => el.classList.toggle("sel", i === idx));
    labels.forEach((el, i) => el.classList.toggle("sel", i === idx));
    wheel.style.setProperty("--pc", idx >= 0 ? modeThemes[COLLECT_WHEEL_TARGETS[idx].mode].accent : g.pointerColor);
    centerText(idx);
  }
  function positionWheel() {
    if (!W) return;
    wheel.style.left = `${W.cx - geom.S / 2}px`;
    wheel.style.top = `${W.cy - geom.S / 2}px`;
  }
  function showTopicArc() {
    if (!W || W.locked || W.arcOpen || W.sel !== 0) return;
    const topics = options.getTopics?.() ?? [];
    W.arcRequested = true;
    W.topicSessionId = options.getDestinations().find(d => d.mode === "topic")?.sessionId;
    W.topicSnapshot = JSON.stringify([W.topicSessionId, topics]);
    const arc = $(".topic-arc");
    if (!topics.length) {
      if (!arcHintShown) {
        arcHintShown = true;
        const hint = doc.createElement("div"); hint.className = "arc-hint";
        hint.style.top = `${Math.max(g.topicRing.hintTop, g.edgePadding - (W.cy - geom.c))}px`;
        hint.textContent = "喺側欄建話題後，呢度會出現"; arc.append(hint);
      }
      return;
    }
    W.arcOpen = true;
    W.topics = topics.length > 5 ? topics.slice(0, 4) : topics;
    W.segments = buildTopicRing(geom.R, topics.length, topics.length > 5);
    const center = clampWheelCenter({ x: W.cx, y: W.cy }, { x: win.innerWidth, y: win.innerHeight }, geom.R, W.segments);
    W.cx = center.x; W.cy = center.y; positionWheel();
    const ringSvg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    ringSvg.setAttribute("viewBox", `0 0 ${geom.S} ${geom.S}`);
    ringSvg.setAttribute("width", String(geom.S)); ringSvg.setAttribute("height", String(geom.S));
    arc.replaceChildren(ringSvg);
    for (const segment of W.segments) {
      const topic = W.topics[segment.index];
      const group = doc.createElementNS(ringSvg.namespaceURI, "g");
      group.setAttribute("class", `arc-seg${segment.more ? " more" : ""}`);
      group.setAttribute("data-arc-index", String(segment.index));
      (group as SVGElement).style.setProperty("--i", String(segment.index));
      const path = doc.createElementNS(ringSvg.namespaceURI, "path");
      path.setAttribute("d", sectorPath(geom.c, geom.R + g.topicRing.innerOffset, geom.R + g.topicRing.outerOffset, segment.a0, segment.a1, g.topicRing.gap));
      group.append(path); ringSvg.append(group);
      const label = doc.createElement("div"); label.className = "arc-lbl";
      label.dataset.arcIndex = String(segment.index); label.setAttribute("role", "menuitem");
      label.style.cssText = `--i:${segment.index};--w:${segment.width}px;--rot:${segment.rotation}deg;left:${geom.c + segment.x}px;top:${geom.c + segment.y}px`;
      const name = doc.createElement("span"), count = doc.createElement("small");
      name.textContent = segment.more ? "其他話題" : topic.name;
      label.title = name.textContent;
      count.textContent = segment.more ? `仲有 ${topics.length - 4} 個` : `${topic.count} 篇`;
      label.append(name, count); arc.append(label);
    }
    arc.classList.add("arc-on");
  }
  function updateSel(dx: number, dy: number) {
    if (!W || W.locked) return;
    const d = Math.hypot(dx, dy), raw = idxFrom(dx, dy);
    wheel.style.setProperty("--ang", `${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg`);
    wheel.style.setProperty("--po", clamp((d - g.jitterPx) / geom.dead, 0, 1).toFixed(2));
    if (raw === 0 && !W.arcOpen) {
      setSel(0);
      if (d > geom.R) { clear(arcTimer); arcTimer = 0; showTopicArc(); }
      else if (!arcTimer) arcTimer = later(() => { arcTimer = 0; showTopicArc(); }, m.topicRestMs);
    } else if (raw !== 0) { clear(arcTimer); arcTimer = 0; }
    // Flick retains the original sector aiming contract; ring targets always use the drawn centre.
    const rx = G ? G.lx - W.cx : lastMouse.x - W.cx, ry = G ? G.ly - W.cy : lastMouse.y - W.cy;
    const hit = W.arcOpen ? hitTopicRing(geom.R, W.segments ?? [], rx, ry) : null;
    W.topicIndex = hit;
    const idx = hit !== null ? 0 : W.sticky && d > geom.R + g.stickyMargin ? -1 : raw;
    setSel(idx); centerText(idx);
    wheel.querySelectorAll<HTMLElement>("[data-arc-index]").forEach(el => el.classList.toggle("picked", hit !== null && Number(el.dataset.arcIndex) === hit));
  }
  function refreshTopics() {
    if (!W || W.locked || !W.arcRequested) return;
    const sessionId = options.getDestinations().find(d => d.mode === "topic")?.sessionId;
    if (W.topicSnapshot === JSON.stringify([sessionId, options.getTopics?.() ?? []])) return;
    W.arcOpen = false; W.topicIndex = null;
    $(".topic-arc").replaceChildren();
    const sel = W.sel; W.sel = 0; showTopicArc(); W.sel = sel;
    if (G) selectGesture(false);
    else updateSel(lastMouse.x - W.cx, lastMouse.y - W.cy);
  }
  function showWheel(post: InlineCollectPost, x: number, y: number, sticky: boolean) {
    clear(closeTimer);
    clear(settledTimer);
    const { S } = geom;
    const { x: cx, y: cy } = clampWheelCenter({ x, y }, { x: win.innerWidth, y: win.innerHeight }, geom.R, []);
    clear(arcTimer); arcTimer = 0;
    $(".topic-arc").replaceChildren(); $(".topic-arc").classList.remove("arc-on");
    W = { post, cx, cy, sticky, sel: -2 };
    sectors.forEach(el => el.classList.remove("sel", "picked"));
    labels.forEach(el => el.classList.remove("sel", "picked"));
    wheel.className = "dlens-collect-wheel";
    wheel.style.left = `${cx - S / 2}px`;
    wheel.style.top = `${cy - S / 2}px`;
    wheel.style.setProperty("--po", "0");
    wheel.hidden = false;
    populate(post);
    setSel(-1);
    void wheel.offsetWidth;
    wheel.classList.add("open");
    if (sticky) {
      wheel.classList.add("sticky");
    }
    settledTimer = later(() => wheel.classList.add("settled"), m.openMs + m.settledSectors * m.staggerMs);
  }
  function hideWheel() {
    wheel.hidden = true;
    wheel.className = "dlens-collect-wheel";
    sectors.forEach(el => el.classList.remove("sel", "picked"));
    labels.forEach(el => el.classList.remove("sel", "picked"));
  }
  function closeWheel(kind: "commit" | "cancel", button?: HTMLButtonElement) {
    if (!W) {
      return;
    }
    const w = W;
    clear(arcTimer); arcTimer = 0;
    W = null;
    clear(settledTimer);
    if (kind === "commit" && button && !reduced()) {
      const r = button.getBoundingClientRect();
      wheel.style.setProperty("--fx", `${r.left + r.width / 2 - w.cx}px`);
      wheel.style.setProperty("--fy", `${r.top + r.height / 2 - w.cy}px`);
      wheel.classList.remove("open", "sticky");
      wheel.classList.add("commit");
      closeTimer = later(hideWheel, m.flyCleanupMs);
    } else {
      wheel.classList.remove("open", "sticky");
      wheel.classList.add(reduced() ? "commit" : "closing");
      closeTimer = later(hideWheel, m.closeCleanupMs);
    }
  }
  function selectGesture(opening: boolean) {
    if (!W || !G) {
      return;
    }
    const selected = selectionCoordinates(coords(G), opening);
    if (selected.jitter) {
      wheel.style.setProperty("--po", "0");
      setSel(-1);
      return;
    }
    updateSel(selected.dx, selected.dy);
  }
  function startGesture(post: InlineCollectPost, x: number, y: number, source: "pointer" | "key", pid: number | null) {
    G = { post, source, pid, ox: x, oy: y, lx: x, ly: y, opened: false, mode: null, timer: 0 };
    post.button.style.setProperty("--hold", `${g.hold}ms`);
    post.button.style.setProperty("--ring", modeThemes[options.getLastMode()].accent);
    post.button.classList.remove("charging");
    void post.button.offsetWidth;
    post.button.classList.add("charging");
    G.timer = later(() => {
      if (G && !G.opened) {
        openFromGesture("hold");
      }
    }, g.hold);
  }
  function openFromGesture(mode: "hold" | "flick") {
    if (!G) {
      return;
    }
    G.opened = true;
    G.mode = G.source === "key" ? "key" : mode;
    clear(G.timer);
    G.post.button.classList.remove("charging");
    showWheel(G.post, G.ox, G.oy, false);
    selectGesture(true);
  }
  function moveGesture(x: number, y: number) {
    if (!G) {
      return;
    }
    G.lx = x;
    G.ly = y;
    if (!G.opened && Math.hypot(x - G.ox, y - G.oy) > g.flickPx) {
      openFromGesture("flick");
    } else if (G.opened) {
      selectGesture(false);
    }
  }
  function endGesture(x: number, y: number) {
    if (!G) {
      return;
    }
    const gesture = G;
    if (W && !W.locked) { G.lx = x; G.ly = y; selectGesture(false); }
    G = null;
    clear(gesture.timer);
    gesture.post.button.classList.remove("charging");
    if (!gesture.opened) {
      options.onTap(gesture.post);
      return;
    }
    if (!W) {
      return;
    }
    const result = releaseGesture(coords(gesture, x, y), W.sel, gesture.source);
    if (result === "commit") {
      commit(W.sel);
      return;
    }
    if (result === "sticky") {
      W.sticky = true;
      wheel.classList.add("sticky");
      centerText(-1);
      return;
    }
    closeWheel("cancel");
  }
  function cancelGesture() {
    if (!G) {
      return;
    }
    const gesture = G;
    G = null;
    clear(gesture.timer);
    gesture.post.button.classList.remove("charging");
    if (gesture.opened) {
      closeWheel("cancel");
    }
  }
  function commit(idx: number) {
    if (!W || W.locked) {
      return;
    }
    W.locked = true;
    const post = W.post, t = COLLECT_WHEEL_TARGETS[idx];
    sectors[idx].classList.add("picked");
    labels[idx].classList.add("picked");
    const pulse = reduced() ? 0 : m.pulseMs, land = reduced() ? 0 : m.pulseMs + m.landAfterPulseMs;
    const segment = idx === 0 && W.topicIndex != null ? W.segments?.[W.topicIndex] : null;
    options.onSave(post, t.mode, { popDelay: land, ...(segment ? segment.more ? { pickTopic: true } : { topicId: W.topics?.[segment.index]?.id, topicSessionId: W.topicSessionId } : {}) });
    later(() => closeWheel("commit", post.button), pulse);
  }
  function hideToast() {
    clear(toastTimer);
    toast.classList.remove("on");
    toast.inert = true;
  }
  function showToast(message: string, onUndo?: () => void) {
    clear(toastTimer);
    toast.replaceChildren();
    const span = doc.createElement("span");
    span.textContent = message;
    toast.append(span);
    if (onUndo) {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = "復原";
      button.onclick = () => {
        hideToast();
        onUndo();
      };
      toast.append(button);
    }
    toast.inert = false;
    toast.classList.add("on");
    toastTimer = later(hideToast, onUndo ? m.toastActionMs : m.toastMessageMs);
  }
  function bindButton(post: InlineCollectPost) {
    const down = (e: PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (G || (W && !W.sticky)) {
        return;
      }
      startGesture(post, e.clientX, e.clientY, "pointer", e.pointerId);
    };
    const click = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.detail === 0 && !G && !W) {
        options.onTap(post);
      }
    };
    post.button.addEventListener("pointerdown", down);
    post.button.addEventListener("click", click);
    const cleanup = () => {
      post.button.removeEventListener("pointerdown", down);
      post.button.removeEventListener("click", click);
      if (G?.post === post) {
        cancelGesture();
      }
      if (W?.post === post) {
        closeWheel("cancel");
      }
      buttonVersions.set(post.button, (buttonVersions.get(post.button) ?? 0) + 1);
      bindings.delete(cleanup);
    };
    bindings.add(cleanup);
    return cleanup;
  }
  const eventCleanups: (() => void)[] = [];
  function listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean) {
    target.addEventListener(type, fn, opts);
    eventCleanups.push(() => target.removeEventListener(type, fn, opts));
  }
  listen(doc, "pointerdown", ((e: PointerEvent) => {
    if (!W || !W.sticky) {
      return;
    }
    const dx = e.clientX - W.cx, dy = e.clientY - W.cy, d = Math.hypot(dx, dy);
    lastMouse = { x: e.clientX, y: e.clientY };
    const hit = W.arcOpen ? hitTopicRing(geom.R, W.segments ?? [], dx, dy) : null;
    if (hit !== null || d <= geom.R + g.stickyMargin) {
      e.preventDefault();
      e.stopPropagation();
      if (W.locked) {
        return;
      }
      if (d < geom.dead) {
        closeWheel("cancel");
        return;
      }
      updateSel(dx, dy);
      const idx = W.sel;
      if (idx >= 0) {
        commit(idx);
      }
      return;
    }
    closeWheel("cancel");
  }) as EventListener, true);
  listen(win, "pointermove", ((e: PointerEvent) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (G && (G.source === "key" || e.pointerId === G.pid)) {
      moveGesture(e.clientX, e.clientY);
    } else if (W?.sticky) {
      updateSel(e.clientX - W.cx, e.clientY - W.cy);
    }
  }) as EventListener);
  listen(win, "pointerup", ((e: PointerEvent) => {
    if (G?.source === "pointer" && e.pointerId === G.pid) {
      endGesture(e.clientX, e.clientY);
    }
  }) as EventListener);
  listen(win, "pointercancel", ((e: PointerEvent) => {
    if (G?.source === "pointer" && e.pointerId === G.pid) {
      cancelGesture();
    }
  }) as EventListener);
  listen(win, "blur", cancelGesture);
  listen(win, "scroll", () => {
    if (W?.sticky && !G) {
      closeWheel("cancel");
    }
  }, { passive: true });
  listen(win, "keydown", ((e: KeyboardEvent) => {
    const target = e.target as Element | null;
    if (target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')) {
      return;
    }
    if (e.key === "Escape") {
      if (G) {
        cancelGesture();
      } else if (W) {
        closeWheel("cancel");
      }
      return;
    }
    if (W && /^[1-4]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      if (G) {
        clear(G.timer);
        G.post.button.classList.remove("charging");
        G = null;
      }
      W.topicIndex = null;
      commit(Number(e.key) - 1);
      return;
    }
    const post = options.getHoveredPost();
    if (e.code === "KeyS" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !G && !W && post) {
      e.preventDefault();
      startGesture(post, lastMouse.x, lastMouse.y, "key", null);
    }
  }) as EventListener);
  listen(win, "keyup", ((e: KeyboardEvent) => {
    if (e.code === "KeyS" && G?.source === "key") {
      endGesture(lastMouse.x, lastMouse.y);
    }
  }) as EventListener);
  listen(toast, "pointerenter", () => clear(toastTimer));
  listen(toast, "pointerleave", () => {
    toastTimer = later(hideToast, m.toastLeaveMs);
  });
  function reset() {
    generation++;
    cancelGesture();
    W = null;
    for (const id of timers)
      win.clearTimeout(id);
    timers.clear();
    hideWheel();
    hideToast();
  }
  function destroy() {
    reset();
    for (const cleanup of [...bindings])
      cleanup();
    for (const cleanup of eventCleanups)
      cleanup();
    wheel.remove();
    toast.remove();
  }
  buildWheel();
  /** v9 移動: open the wheel in sticky mode on a post's own button. */
  function openSticky(post: InlineCollectPost) {
    const r = post.button.getBoundingClientRect();
    showWheel(post, r.left + r.width / 2, r.top + r.height / 2, true);
  }
  return { bindButton, reset, destroy, showToast, hideToast, openSticky, refreshTopics };
}
