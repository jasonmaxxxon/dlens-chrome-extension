import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
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
  assert.match(html,/data-collection-in-view/);assert.match(html,/畫面上：@saved/);assert.match(html,/睇 ›/);
 }
 const html=renderToStaticMarkup(<CollectionWorkspaceShell tab="collection" onTabChange={()=>{}} onSettings={()=>{}} inView={null}>body</CollectionWorkspaceShell>);
 assert.doesNotMatch(html,/data-collection-in-view/);
});
