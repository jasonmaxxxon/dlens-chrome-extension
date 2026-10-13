import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { FolderMode, SessionRecord } from "../src/state/types.ts";
import { WorkspaceHomeView } from "../src/ui/WorkspaceHomeView.tsx";

function session(id: string, name: string, mode: FolderMode): SessionRecord {
  return { id, name, mode, items: [], createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z" };
}

type Props = React.ComponentProps<typeof WorkspaceHomeView>;

async function withView(props: Props, run: (host: HTMLElement, dom: JSDOM, rerender: (next: Props) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://dlens.test" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  const rerender = async (next: Props) => { await act(async () => root.render(<WorkspaceHomeView {...next} />)); };
  try {
    await rerender(props);
    await run(host, dom, rerender);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    if (previousAct === undefined) delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    else actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    dom.window.close();
  }
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll("button")).find((entry) => entry.textContent === label);
  assert.ok(result, `button ${label} must exist`);
  return result;
}

async function fillForm(host: HTMLElement, dom: JSDOM, name: string, mode: FolderMode) {
  const input = host.querySelector<HTMLInputElement>('input[name="workspace-name"]');
  const select = host.querySelector<HTMLSelectElement>('select[name="workspace-type"]');
  assert.ok(input);
  assert.ok(select);
  await act(async () => {
    input.value = name;
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    select.value = mode;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

test("workspace home keeps every same-mode folder and legacy archive reachable", async () => {
  const sessions = [session("one", "Topic workspace", "topic"), session("two", "另一項研究", "topic"), session("archive", "Archive", "archive")];
  const opened: string[] = [];
  await withView({ sessions, activeSessionId: "one", onOpen: (id) => { opened.push(id); }, onCreate: async () => undefined }, async (host) => {
    assert.match(host.textContent ?? "", /議題探索/);
    assert.match(host.textContent ?? "", /收藏整理/);
    assert.equal(host.querySelectorAll("h1,h2").length, 0);
    for (const id of ["two", "one", "archive"]) {
      const row = host.querySelector<HTMLButtonElement>(`[data-workspace-session="${id}"]`);
      assert.ok(row);
      await act(async () => row.click());
    }
    assert.deepEqual(opened, ["two", "one", "archive"]);
  });
});

test("new workspace sends explicit trimmed name and chosen type once while pending", async () => {
  const calls: Array<[string, FolderMode]> = [];
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => { finish = resolve; });
  await withView({ sessions: [], activeSessionId: null, onOpen: () => undefined, onCreate: async (name, mode) => { calls.push([name, mode]); await completion; } }, async (host, dom) => {
    assert.equal(host.querySelector("form"), null);
    await act(async () => button(host, "＋ 新工作區").click());
    const select = host.querySelector<HTMLSelectElement>("select")!;
    assert.equal(select.value, "topic");
    assert.deepEqual(Array.from(select.options).map((option) => [option.value, option.textContent]), [["topic", "議題探索"], ["product", "個人應用"], ["pr-evidence", "訊息核對"]]);
    assert.equal(button(host, "建立").disabled, true);
    await fillForm(host, dom, "  我的應用  ", "product");
    const form = host.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(calls, [["我的應用", "product"]]);
    assert.equal(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled, true);
    await act(async () => finish());
    assert.equal(host.querySelector("form"), null);
  });
});

test("creation failures preserve user input, display safe feedback and allow retry", async () => {
  let attempts = 0;
  await withView({ sessions: [], activeSessionId: null, onOpen: () => undefined, onCreate: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("private transport payload");
    if (attempts === 2) return { ok: false, error: "private service response" };
    return { ok: true };
  } }, async (host, dom) => {
    await act(async () => button(host, "＋ 新工作區").click());
    await fillForm(host, dom, "訊息研究", "pr-evidence");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => button(host, "建立").click());
      assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /未能建立工作區/);
      assert.doesNotMatch(host.textContent ?? "", /private/);
      assert.equal(host.querySelector<HTMLInputElement>("input")?.value, "訊息研究");
      assert.equal(host.querySelector<HTMLSelectElement>("select")?.value, "pr-evidence");
      assert.equal(button(host, "建立").disabled, false);
    }
    await act(async () => button(host, "建立").click());
    assert.equal(attempts, 3);
    assert.equal(host.querySelector("form"), null);
  });
});

test("busy state blocks navigation and submission; an empty home invents no workspaces", async () => {
  const html = renderToStaticMarkup(<WorkspaceHomeView sessions={[]} activeSessionId={null} onOpen={() => undefined} onCreate={async () => undefined} />);
  assert.match(html, /還沒有工作區/);
  assert.doesNotMatch(html, /data-workspace-session/);
  let calls = 0;
  const props: Props = { sessions: [session("one", "研究", "topic")], activeSessionId: "one", onOpen: () => { calls += 1; }, onCreate: async () => { calls += 1; } };
  await withView(props, async (host, dom, rerender) => {
    await act(async () => button(host, "＋ 新工作區").click());
    await fillForm(host, dom, "新研究", "topic");
    await rerender({ ...props, busy: true });
    const row = host.querySelector<HTMLButtonElement>('[data-workspace-session="one"]')!;
    assert.equal(row.disabled, true);
    assert.equal(button(host, "建立").disabled, true);
    await act(async () => {
      row.click();
      host.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(calls, 0);
  });
});

test("workspace management renames the selected inactive archive once and preserves errors for retry", async () => {
  const calls: Array<[string, string]> = [];
  let finish!: (result: unknown) => void;
  const props: Props = {
    sessions: [session("active", "研究", "topic"), session("archive", "舊收藏", "archive")], activeSessionId: "active",
    onOpen: () => assert.fail("management must not activate a workspace"), onCreate: async () => undefined,
    onRename: async (id, name) => { calls.push([id, name]); return new Promise((resolve) => { finish = resolve; }); },
    onDelete: async () => undefined
  };
  await withView(props, async (host, dom) => {
    const menu = host.querySelector<HTMLElement>('[data-workspace-management="archive"]');
    assert.ok(menu, "each existing archive has a secondary management menu");
    assert.equal(menu.querySelector("summary")!.style.listStyle, "none", "the ••• menu shows no disclosure triangle");
    await act(async () => button(menu, "重新命名").click());
    const input = host.querySelector<HTMLInputElement>('input[name="workspace-rename"]')!;
    assert.equal(input.value, "舊收藏");
    await act(async () => { input.value = "  保留收藏  "; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await act(async () => { button(host, "儲存名稱").click(); button(host, "儲存名稱").click(); });
    assert.deepEqual(calls, [["archive", "保留收藏"]]);
    assert.equal(button(host, "儲存名稱").disabled, true);
    await act(async () => finish({ ok: false, error: "private transport details" }));
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /未能重新命名/);
    assert.doesNotMatch(host.textContent ?? "", /private/);
    assert.equal(input.value, "  保留收藏  ");
    await act(async () => button(host, "儲存名稱").click());
    await act(async () => finish({ ok: true }));
    assert.equal(host.querySelector('input[name="workspace-rename"]'), null);
  });
});

test("workspace deletion confirms the explicit target, blocks duplicate requests and allows retry", async () => {
  const calls: string[] = [];
  let finish!: (result: unknown) => void;
  await withView({
    sessions: [session("active", "研究", "topic"), session("archive", "舊收藏", "archive")], activeSessionId: "active",
    onOpen: () => assert.fail("delete must not activate a workspace"), onCreate: async () => undefined,
    onRename: async () => undefined,
    onDelete: async (id) => { calls.push(id); return new Promise((resolve) => { finish = resolve; }); }
  }, async (host) => {
    const menu = host.querySelector<HTMLElement>('[data-workspace-management="archive"]');
    assert.ok(menu);
    await act(async () => button(menu, "刪除").click());
    assert.deepEqual(calls, [], "opening the confirmation must not delete");
    const confirmation = host.querySelector('[role="alertdialog"]');
    assert.ok(confirmation);
    assert.match(confirmation.textContent ?? "", /舊收藏/);
    await act(async () => button(host, "取消").click());
    assert.deepEqual(calls, []);
    await act(async () => button(menu, "刪除").click());
    await act(async () => { button(host, "確認刪除").click(); button(host, "確認刪除").click(); });
    assert.deepEqual(calls, ["archive"]);
    assert.equal(button(host, "確認刪除").disabled, true);
    await act(async () => finish({ ok: false }));
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /未能刪除/);
    assert.ok(host.querySelector('[role="alertdialog"]'));
    await act(async () => button(host, "確認刪除").click());
    await act(async () => finish({ ok: true }));
    assert.equal(host.querySelector('[role="alertdialog"]'), null);
  });
});

test("PR-only creation keeps its allowed purpose after reopening the form", async () => {
  const calls: string[] = [];
  await withView({ sessions: [], activeSessionId: null, allowedCreationModes: ["pr-evidence"], onOpen: () => undefined,
    onCreate: async (_name, mode) => { calls.push(mode); return { ok: true }; }
  }, async (host, dom) => {
    for (let index = 0; index < 2; index += 1) {
      await act(async () => button(host, "＋ 新工作區").click());
      assert.deepEqual(Array.from(host.querySelector<HTMLSelectElement>("select")!.options).map((option) => option.value), ["pr-evidence"]);
      const input = host.querySelector<HTMLInputElement>('input[name="workspace-name"]')!;
      await act(async () => { input.value = "訊息核對"; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
      await act(async () => button(host, "建立").click());
    }
    assert.deepEqual(calls, ["pr-evidence", "pr-evidence"]);
  });
});


test("workspace B cards expose purpose, count, last save and at most four stacked previews", async () => {
  const { item, descriptor } = await import("./collection-browser.fixtures.ts");
  const nowMs = Date.parse("2026-10-13T12:00:00Z");
  const workspace = session("one", "研究", "topic");
  workspace.items = Array.from({ length: 5 }, (_, i) => item(String(i), { savedAt: new Date(nowMs - (i + 1) * 3600000).toISOString(), descriptor: descriptor({ post_url: `https://threads.com/@author/post/${i}`, image_url: i % 2 ? null : `https://images.test/${i}.jpg` }) }));
  const html = renderToStaticMarkup(<WorkspaceHomeView sessions={[workspace]} nowMs={nowMs} activeSessionId="one" onOpen={() => undefined} onCreate={async () => undefined} />);
  const doc = new JSDOM(html).window.document;
  assert.match(doc.body.textContent ?? "", /1 個工作區/);
  assert.match(doc.body.textContent ?? "", /睇大家點講、有咩分歧/);
  assert.match(doc.body.textContent ?? "", /5 篇 · 最近收藏 1h 前/);
  assert.equal(doc.querySelectorAll("[data-workspace-preview]").length, 4);
  assert.equal(doc.querySelectorAll("[data-workspace-preview] img").length, 2);
  const tiles = [...doc.querySelectorAll("[data-workspace-preview]")].filter(preview => !preview.querySelector("img"));
  assert.equal(tiles.length, 2);
  assert.ok(tiles.every(preview => preview.querySelector("[data-collection-type-tile]")?.textContent === "收"));
});

test("the whole workspace card opens it once, while its menu keeps its own click", async () => {
  const opened: string[] = [];
  await withView({
    sessions: [session("one", "觀眾反應", "topic")], activeSessionId: null,
    onOpen: (id) => { opened.push(id); }, onCreate: async () => undefined, onRename: async () => undefined
  }, async (host) => {
    const card = host.querySelector<HTMLElement>('[data-workspace-card]')!;
    await act(async () => card.querySelector("p")!.click());
    await act(async () => card.querySelector<HTMLElement>("[data-workspace-session]")!.click());
    await act(async () => card.querySelector<HTMLElement>("summary")!.click());
    assert.deepEqual(opened, ["one", "one"], "purpose text and name each open once; the ⋯ menu opens nothing");
  });
});

test("workspace cards render the wheel's icon for each mode", () => {
  const html = renderToStaticMarkup(<WorkspaceHomeView sessions={(["topic", "product", "pr-evidence", "archive"] as const).map(mode => ({ id: mode, name: mode, mode, createdAt: "", updatedAt: "", items: [] }))} activeSessionId={null} onOpen={() => {}} onCreate={() => {}} />);
  for (const name of ["compass", "box", "shield", "archive"]) assert.match(html, new RegExp(`lucide-${name}`));
});
