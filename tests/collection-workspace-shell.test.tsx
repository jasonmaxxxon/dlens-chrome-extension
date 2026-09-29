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
