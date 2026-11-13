import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { tokens } from "../src/ui/tokens";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionWorkspaceShell } from "../src/ui/CollectionWorkspaceShell";

test("primary shell leads with only collection and workspaces, diagnostics stay secondary", () => {
 const html=renderToStaticMarkup(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}} diagnostics={<span>backend diagnostic</span>}><p>source body</p></CollectionWorkspaceShell>);
 assert.match(html,/role="tab"[^>]*aria-selected="true"[^>]*>收藏/);
 assert.match(html,/>工作區<\/button>/);
 assert.doesNotMatch(html,/>Topic<|>Product<|>PR<|data-shell-header="workspace"/);
 assert.match(html,/<details[^>]*data-collection-menu/);
 assert.doesNotMatch(html,/<details[^>]*open/);
 assert.match(html,/source body/);
});

test('畫面上 bar renders under the header on either primary tab and disappears when unmatched',()=>{
 for (const tab of ['collection','workspaces'] as const) {
  const html=renderToStaticMarkup(<CollectionWorkspaceShell tab={tab} onTabChange={()=>{}} onSettings={()=>{}} inView={{author:'saved',summary:'來源摘要'}} onInView={()=>{}}>body</CollectionWorkspaceShell>);
  assert.match(html,/data-collection-in-view/);assert.match(new JSDOM(html).window.document.querySelector("[data-collection-in-view]")!.textContent!,/畫面上 · @saved/);assert.match(html,/打開/);
 }
 const html=renderToStaticMarkup(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}} inView={null}>body</CollectionWorkspaceShell>);
 assert.doesNotMatch(html,/data-collection-in-view/);
});


test("shell keeps the health dot inside one compact menu trigger", () => {
 const html=renderToStaticMarkup(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}} backendReachability="reachable">body</CollectionWorkspaceShell>);
 const doc=new JSDOM(html).window.document;
 const header=doc.querySelector<HTMLElement>("header")!;
 const trigger=doc.querySelector<HTMLElement>("[data-collection-menu] > summary")!;
 assert.equal(header.style.height, `${tokens.panel.size.header}px`);
 assert.equal(trigger.style.width, `${tokens.panel.size.button}px`);
 assert.equal(trigger.style.height, `${tokens.panel.size.button}px`);
 assert.equal(trigger.getAttribute("aria-label"), "更多選項 · 後端已連線");
 assert.equal(trigger.getAttribute("aria-expanded"), "false");
 assert.ok(trigger.querySelector("[data-collection-health-dot]"));
 assert.equal(doc.querySelectorAll("[data-collection-health-dot]").length, 1);
});

test("shell marks unreachable health and reserves the banner geometry", () => {
 const html=renderToStaticMarkup(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}} backendReachability="unreachable" inView={{author:"saved",summary:"來源摘要"}} onInView={()=>{}}>body</CollectionWorkspaceShell>);
 const doc=new JSDOM(html).window.document;
 const trigger=doc.querySelector<HTMLElement>("[data-collection-menu] > summary")!;
 const banner=doc.querySelector<HTMLElement>("[data-collection-in-view]")!;
 assert.equal(trigger.getAttribute("aria-label"), "更多選項 · 連唔到後端");
 assert.equal(banner.style.height, `${tokens.panel.size.banner}px`);
 assert.equal(banner.style.top, `${tokens.panel.size.header}px`);
 assert.ok(banner.querySelector("[data-collection-thumbnail]"));
 assert.equal(banner.querySelector("button")!.textContent, "打開");
});


test("menu Escape closes the popover and returns focus to its trigger", async () => {
 const dom=new JSDOM('<div id="root"></div>', {url:"https://dlens.test"});
 const prior={window:globalThis.window,document:globalThis.document,HTMLElement:globalThis.HTMLElement,Element:globalThis.Element};
 const actGlobal=globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean};
 const priorAct=actGlobal.IS_REACT_ACT_ENVIRONMENT;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element});
 actGlobal.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=await import("react-dom/client");
 const root=createRoot(dom.window.document.getElementById("root")!);
 try {
  await act(async()=>root.render(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}}>body</CollectionWorkspaceShell>));
  const menu=dom.window.document.querySelector<HTMLDetailsElement>("[data-collection-menu]")!;
  const trigger=menu.querySelector<HTMLElement>("summary")!;
  await act(async()=>{menu.open=true;menu.dispatchEvent(new dom.window.Event("toggle"));});
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const settings=menu.querySelector<HTMLButtonElement>("button")!;
  settings.focus();
  await act(async()=>settings.dispatchEvent(new dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  assert.equal(menu.open,false);
  assert.equal(trigger.getAttribute("aria-expanded"),"false");
  assert.equal(dom.window.document.activeElement,trigger);
 } finally {
  await act(async()=>root.unmount());
  Object.assign(globalThis,prior);actGlobal.IS_REACT_ACT_ENVIRONMENT=priorAct;dom.window.close();
 }
});


test("menu shows connection details immediately with the release label", () => {
 const html=renderToStaticMarkup(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}} diagnostics={<span data-fixture-diagnostic="">12/14 篇讀完</span>}>body</CollectionWorkspaceShell>);
 const doc=new JSDOM(html).window.document;
 const menu=doc.querySelector<HTMLElement>("[data-collection-menu]")!;
 const popover=menu.querySelector<HTMLElement>("[data-collection-popover]")!;
 assert.equal(menu.querySelectorAll("details").length,0);
 assert.equal(popover.style.width,"280px");
 assert.match(popover.textContent!,/連線/);
 assert.match(popover.textContent!,/12\/14 篇讀完/);
 assert.match(popover.textContent!,/DLens 0.5.93/);
 assert.equal(popover.querySelector("button")!.textContent,"設定");
});
