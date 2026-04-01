import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TargetDescriptor } from "../src/contracts/target-descriptor.ts";
import { PreviewCard } from "../src/ui/components.tsx";

function makeDescriptor(overrides: Partial<TargetDescriptor> = {}): TargetDescriptor {
  return {
    target_type: "post",
    page_url: "https://www.threads.net/@alpha/post/abc",
    post_url: "https://www.threads.net/@alpha/post/abc?x=1#y",
    author_hint: "alpha",
    text_snippet: "alpha snippet",
    time_token_hint: "1h",
    dom_anchor: "card-1",
    engagement: {
      likes: 12,
      comments: 3,
      reposts: 2,
      forwards: 1,
      views: 100
    },
    engagement_present: {
      likes: true,
      comments: true,
      reposts: true,
      forwards: true,
      views: true
    },
    captured_at: "2026-03-25T10:00:00Z",
    ...overrides
  };
}

test("PreviewCard renders author, folder, saved badge, and metric chips", () => {
  const html = renderToStaticMarkup(
    React.createElement(PreviewCard, {
      descriptor: makeDescriptor(),
      folderName: "Signals",
      isSaved: true,
      onPrimary: () => undefined,
      onOpen: () => undefined
    })
  );

  assert.match(html, /Current post preview/);
  assert.match(html, /alpha/);
  assert.match(html, /Saved/);
  assert.match(html, /Signals/);
  assert.match(html, />12</);
  assert.match(html, />3</);
  assert.match(html, />2</);
  assert.match(html, />1</);
});
