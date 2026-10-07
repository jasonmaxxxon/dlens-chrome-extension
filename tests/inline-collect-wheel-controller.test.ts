import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createInlineCollectWheel, updateSavedButton, COLLECT_WHEEL_TARGETS, INLINE_COLLECT_BUTTON_HTML, DLENS_INLINE_COLLECT_CSS, type InlineCollectPost } from "../src/content/inline-collect-wheel.ts";
import { tokens } from "../src/ui/tokens.ts";
import { DLENS_KEYFRAMES_CSS, DLENS_PROPERTY_CSS } from "../src/ui/motion.ts";
function fixture(reduced = false) {
    const dom = new JSDOM('<body><div id="overlay"></div><button id="save"></button><button id="chip" hidden></button></body>', { url: "https://www.threads.net/" });
    const { window: win } = dom;
    const doc = win.document;
    let now = 0, seq = 0;
    const timers = new Map<number, {
        at: number;
        fn: () => void;
    }>();
    win.setTimeout = ((fn: () => void, ms = 0) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; }) as typeof win.setTimeout;
    win.clearTimeout = (id) => { timers.delete(id); };
    win.matchMedia = (() => ({ matches: reduced })) as typeof win.matchMedia;
    const advance = (ms: number) => { const until = now + ms; while (true) {
        const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due)
            break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
    } now = until; };
    const button = doc.querySelector<HTMLButtonElement>("#save")!, chip = doc.querySelector<HTMLButtonElement>("#chip")!;
    button.innerHTML = INLINE_COLLECT_BUTTON_HTML;
    button.getBoundingClientRect = () => ({ left: 382, top: 382, width: 36, height: 36, right: 418, bottom: 418, x: 382, y: 382, toJSON: () => ({}) });
    const post: InlineCollectPost = { identity: "post-a", button, chip, descriptor: { target_type: "post", page_url: win.location.href, post_url: "https://www.threads.net/@a/post/abc", author_hint: "a", text_snippet: "text", time_token_hint: "", dom_anchor: "", engagement: { likes: 5, comments: 8, reposts: null, forwards: null, views: null }, engagement_present: { likes: true, comments: true, reposts: false, forwards: false, views: false }, captured_at: "2026-10-07T00:00:00.000Z" } };
    const saves: {
        mode: string;
        at: number;
        popDelay: number;
    }[] = [];
    let taps = 0;
    const wheel = createInlineCollectWheel({ overlayRoot: doc.querySelector<HTMLElement>("#overlay")!, getDestinations: () => COLLECT_WHEEL_TARGETS.map(t => ({ mode: t.mode, sessionId: t.mode, sessionName: `實際 ${t.name}` })), getLastMode: () => "topic", getSavedMode: () => null, getHoveredPost: () => post, onTap: () => { taps++; }, onSave: (p, mode, options) => { saves.push({ mode, at: now, popDelay: options.popDelay }); updateSavedButton(p, mode, `實際 ${mode}`, options); } });
    wheel.bindButton(post);
    const pointer = (type: string, x = 400, y = 400, target: EventTarget = button) => { const e = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(e, "pointerId", { value: 1 }); target.dispatchEvent(e); };
    const key = (type: string, key: string, code = key) => win.dispatchEvent(new win.KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
    const element = doc.querySelector<HTMLElement>("[data-dlens-wheel-root]")!;
    return { dom, doc, win, post, wheel, element, saves, advance, pointer, key, taps: () => taps };
}
test("hold opens at 180ms, becomes sticky, saves on release before 90ms pulse and 300ms landing", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.advance(179);
    assert.equal(f.element.hidden, true);
    f.advance(1);
    assert.equal(f.element.hidden, false);
    f.pointer("pointerup", 400, 400, f.win);
    assert.ok(f.element.classList.contains("sticky"));
    f.pointer("pointerdown", 500, 400, f.element);
    assert.deepEqual(f.saves, [{ mode: "product", at: 180, popDelay: 300 }]);
    assert.ok(f.element.classList.contains("open"));
    assert.equal(f.post.button.classList.contains("pop"), false);
    f.advance(89);
    assert.equal(f.element.classList.contains("commit"), false);
    f.advance(1);
    assert.ok(f.element.classList.contains("commit"));
    assert.equal(f.element.style.getPropertyValue("--fx"), "0px");
    f.advance(209);
    assert.equal(f.post.button.classList.contains("pop"), false);
    f.advance(1);
    assert.ok(f.post.button.classList.contains("pop"));
    f.wheel.destroy();
    f.dom.window.close();
});
test("wheel session names are real and sectors retain fixed mode order", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.advance(180);
    assert.deepEqual(Array.from(f.element.querySelectorAll(".lbl b"), e => e.textContent), ["觀眾反應", "個人應用", "活動追蹤", "收藏整理"]);
    assert.deepEqual(Array.from(f.element.querySelectorAll(".lbl small"), e => e.textContent), ["實際 觀眾反應", "實際 個人應用", "實際 活動追蹤", "實際 收藏整理"]);
    f.wheel.destroy();
    f.dom.window.close();
});
test("S supports sectors 1–4 and Escape; unmoved S release cancels exactly as v9", () => {
    for (let index = 0; index < 4; index++) {
        const f = fixture();
        f.pointer("pointermove", 400, 400, f.win);
        f.key("keydown", "s", "KeyS");
        f.advance(180);
        f.key("keydown", String(index + 1));
        assert.equal(f.saves[0]?.mode, COLLECT_WHEEL_TARGETS[index].mode);
        f.wheel.destroy();
        f.dom.window.close();
    }
    const f = fixture();
    f.key("keydown", "s", "KeyS");
    f.advance(180);
    f.key("keyup", "s", "KeyS");
    assert.ok(f.element.classList.contains("closing"));
    assert.equal(f.element.classList.contains("sticky"), false);
    f.advance(140);
    f.key("keydown", "s", "KeyS");
    f.advance(180);
    f.key("keydown", "Escape");
    assert.ok(f.element.classList.contains("closing"));
    assert.equal(f.saves.length, 0);
    f.wheel.destroy();
    f.dom.window.close();
});
test("quick pointer tap uses onTap and never opens the wheel", () => {
    const f = fixture();
    f.pointer("pointerdown");
    f.advance(50);
    f.pointer("pointerup", 400, 400, f.win);
    assert.equal(f.taps(), 1);
    f.advance(180);
    assert.equal(f.element.hidden, true);
    f.wheel.destroy();
    f.dom.window.close();
});
test("a confirmed same saved destination preserves delayed landing pop; newer unsave cancels it", () => {
    const f = fixture();
    updateSavedButton(f.post, "product", "Workspace", { popDelay: 300 });
    f.advance(20);
    updateSavedButton(f.post, "product", "Workspace", { quiet: true });
    f.advance(279);
    assert.equal(f.post.button.classList.contains("pop"), false);
    f.advance(1);
    assert.ok(f.post.button.classList.contains("pop"));
    updateSavedButton(f.post, "topic", "Another", { popDelay: 300 });
    f.advance(20);
    updateSavedButton(f.post, null);
    f.advance(300);
    assert.equal(f.post.button.classList.contains("pop"), false);
    assert.equal(f.post.chip.hidden, true);
    f.wheel.destroy();
    f.dom.window.close();
});
test("hidden undo toast is inert, visible undo fires once and reset retires held gestures", () => {
    const f = fixture();
    const toast = f.doc.querySelector<HTMLElement>(".dlens-collect-toast")!;
    assert.equal(toast.inert, true);
    let undo = 0;
    f.wheel.showToast("已移除", () => undo++);
    assert.equal(toast.inert, false);
    toast.querySelector("button")!.click();
    assert.equal(undo, 1);
    assert.equal(toast.inert, true);
    f.pointer("pointerdown");
    f.wheel.reset();
    f.advance(400);
    assert.equal(f.element.hidden, true);
    assert.equal(f.post.button.classList.contains("charging"), false);
    f.wheel.destroy();
    f.dom.window.close();
});
test("motion parity locks animation timing, scale, registry and reduced-motion opacity rules", () => {
    const m = tokens.motion.collectWheel;
    assert.deepEqual([m.openMs, m.opacityMs, m.staggerMs, m.pulseMs, m.landAfterPulseMs, m.openMs + m.settledSectors * m.staggerMs], [240, 110, 14, 90, 210, 352]);
    assert.deepEqual([m.openScale, m.flyScale, m.burstMs, m.popMs, m.chipMs], [.78, .14, 460, 420, 280]);
    for (const name of ["charge", "burst", "pop", "spin", "chip-in"])
        assert.ok(DLENS_KEYFRAMES_CSS.includes(`@keyframes dlens-collect-${name}`));
    assert.match(DLENS_PROPERTY_CSS, /@property --dlens-collect-charge/);
    assert.match(DLENS_INLINE_COLLECT_CSS, /prefers-reduced-motion:reduce/);
    assert.match(DLENS_INLINE_COLLECT_CSS, /transition:opacity 90ms linear !important/);
    assert.match(DLENS_INLINE_COLLECT_CSS, /transition:opacity 120ms !important/);
});
test("reduced-motion keeps release save synchronous with zero pulse and landing delay", () => {
    const f = fixture(true);
    f.pointer("pointerdown");
    f.pointer("pointermove", 500, 400, f.win);
    f.pointer("pointerup", 500, 400, f.win);
    assert.deepEqual(f.saves, [{ mode: "product", at: 0, popDelay: 0 }]);
    assert.ok(f.post.button.classList.contains("pop"));
    f.advance(0);
    assert.ok(f.element.classList.contains("commit"));
    f.wheel.destroy();
    f.dom.window.close();
});

test("inline chip and button share the v9 action-bar row and gap", () => {
  assert.match(DLENS_INLINE_COLLECT_CSS, /\.dlens-collect-inline \{display:inline-flex;align-items:center;flex:none;gap:2px;margin-inline-start:auto\}/);
});
