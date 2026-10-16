import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { parseDeepReadingResponse } from '../src/compare/deep-reading';
import { readingCoverageLabel } from '../src/compare/reading-coverage';
import { RefLinks } from '../src/ui/ReadingParts';

const catalog = [{ ref: 'e1', role: 'op' as const }, { ref: 'e2', role: 'reply' as const }, { ref: 'e3', role: 'reply' as const }];
const raw = (takeaway: string) => JSON.stringify({ background: '合成背景。', takeaway, terms: [], evidence: { strong: [], weak: [] }, unanswered: [],
  debates: [{ question: '合成問題？', status: 'open', sides: [{ who: '作者', claim: '甲', basis: 'opinion', note: '', refs: ['e1'] }, { who: '觀眾', claim: '乙', basis: 'opinion', note: '', refs: ['e2'] }] }] });

test('dropping an author-only side keeps the takeaway and removes only its consensus sentence', () => {
  assert.equal(parseDeepReadingResponse(raw('留言多數勸佢休息。可以先申請援助。'), { catalog })!.takeaway, '留言多數勸佢休息。可以先申請援助。');
  assert.equal(parseDeepReadingResponse(raw('大家一致反對。可以先申請援助。'), { catalog })!.takeaway, '可以先申請援助。');
  assert.equal(parseDeepReadingResponse(raw('大家一致反對。'), { catalog })!.takeaway, '未見足夠觀眾分歧；作者回應只作解釋。');
});

test('coverage names what reached the model in one short line', () => {
  const c = { posts: { included: 1, omitted: 0, captured: 1 }, bodyCharacters: { sent: 52, captured: 52 }, replyQuotes: { sent: 65, captured: 65 }, summaries: { sent: 0, available: 0 }, reductions: [] };
  assert.equal(readingCoverageLabel(c), '送入模型：1 篇正文 · 65 則留言原句');
  assert.equal(readingCoverageLabel({ ...c, replyQuotes: { sent: 40, captured: 65 }, reductions: [{ kind: 'replies-selected' as const }] }), '送入模型：1 篇正文 · 40 則留言原句（已抓取 65 則）。留言經抽樣');
});

test('a second reply by one author is numbered and a ref opens its source under that line', async () => {
  const dom = new JSDOM('<div id="root"></div>'); const old = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document }); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client'); const container = document.getElementById('root')!; const root = createRoot(container);
  const items = [{ key: 'a', label: 'fan', source: () => <p data-src="">甲原文</p> }, { key: 'b', label: 'fan', source: () => <p data-src="">乙原文</p> }];
  try {
    await act(async () => root.render(<section><p>第一點<RefLinks items={items} /></p><p data-next="">第二點</p></section>));
    assert.deepEqual([...container.querySelectorAll('[data-reading-ref]')].map(e => e.textContent), ['@fan', '@fan #2']);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-reading-ref="b"]')!.click());
    const refs = container.querySelector('[data-reading-refs]')!;
    assert.equal(refs.querySelector('[data-src]')?.textContent, '乙原文', 'the source opens inside the clicked line, not at the end of the card');
    await act(async () => container.querySelector<HTMLButtonElement>('[data-reading-source-close]')!.click());
    assert.equal(container.querySelector('[data-src]'), null);
  } finally { await act(async () => root.unmount()); Object.assign(globalThis, old); dom.window.close(); }
});
