import assert from 'node:assert/strict';
import test from 'node:test';
import { item, session, capture, descriptor } from './collection-browser.fixtures';
import { buildInlineCardViewModel, buildInlineSaveLine, nextInlineDisclosure, nextReturnGlow } from '../src/viewmodel/inline-card';
import { renderInlineCard, renderInlineSaveLine } from '../src/content/inline-collect-card';
import { buildCollectionPosts, buildCollectionArrivalModel } from '../src/viewmodel/collection-browser';
import { loadOpenedReadings, markReadingOpened, OPENED_READING_PREFIX } from '../src/state/opened-readings-storage';
const now = Date.parse('2026-10-13T12:00:00Z');
const iso = (delta = 0) => new Date(now + delta).toISOString();
const done = (id = 'i', delta = 0) => item(id, { status: 'succeeded', completedAt: iso(delta), latestCapture: capture({}, { captured_at: iso(delta), analysis: { status: 'succeeded', generated_at: iso(delta), clusters: [], evidence: [] } as NonNullable<ReturnType<typeof capture>['analysis']> }), descriptor: descriptor({ post_url: `https://www.threads.com/@a/post/${id}` }) });
test('save line projects peek, ETA, long wait, done and retry', () => {
  const running = item('i', { status: 'running', lastStatusAt: iso() });
  const vm = buildInlineCardViewModel(running, 'topic', '觀眾反應', { now, peek: { state: 'ready', replies: [{ text: '好用', author: 'a', likes: 9 }] } });
  assert.equal(buildInlineSaveLine(vm, now, now, null).status, '「好用」 ♡ 9');
  assert.equal(buildInlineSaveLine(vm, now + 1000, now, null).status, '讀緊留言 · 約 1 分');
  assert.equal(buildInlineSaveLine(vm, now + 300000, now, null).status, '讀緊留言 · 比平常久');
  const finished = buildInlineCardViewModel(done(), 'topic', '觀眾反應', { now });
  const line = buildInlineSaveLine(finished, now, null, null);
  assert.equal(line.status, '讀完 · 0 種講法 · 1 則留言');
  assert.match(renderInlineSaveLine(line, false, false), /打開 ▾/);
  const failed = buildInlineCardViewModel(item('i', { status: 'failed', lastError: '離線' }), 'topic', '', { now });
  assert.equal(buildInlineSaveLine(failed, now, null, null).status, '抓取失敗 · 離線');
  assert.match(renderInlineSaveLine(buildInlineSaveLine(failed, now, null, null), false, false), /重試/);
});
test('disclosure expands only ready readings and requests opened write', () => {
  assert.deepEqual(nextInlineDisclosure(false, true), { expanded: true, markOpened: true });
  assert.deepEqual(nextInlineDisclosure(true, true), { expanded: false, markOpened: false });
  assert.deepEqual(nextInlineDisclosure(false, false), { expanded: false, markOpened: false });
  const vm = buildInlineCardViewModel(done(), 'topic', '', { now });
  const line = renderInlineSaveLine(buildInlineSaveLine(vm, now, null, null), true, false);
  assert.match(line, /收起 ▴/);
  assert.match(line + renderInlineCard(vm, null, now), /只有 1 則留言/);
});
test('offscreen completion glows exactly once on return', () => {
  let state = nextReturnGlow(undefined, false, false);
  state = nextReturnGlow(state, true, false);
  assert.equal(state.pending, true);
  state = nextReturnGlow(state, true, true);
  assert.equal(state.glow, true);
  state = nextReturnGlow(state, true, false);
  state = nextReturnGlow(state, true, true);
  assert.equal(state.glow, false);
});
test('arrival strip keeps newest three in 24h; all filters all finished posts', () => {
  const posts = buildCollectionPosts([session('s', [done('a', -1000), done('b', -2000), done('c', -3000), done('d', -4000), done('old', -86400001), item('waiting')], 'topic')]);
  const model = buildCollectionArrivalModel(posts, {}, {}, now, true);
  assert.deepEqual(model.recent.map(r => r.itemId), ['a', 'b', 'c']);
  assert.equal(model.posts.length, 5);
  assert.equal(model.states[posts.find(p => p.memberships[0].itemId === 'a')!.key], 'dot');
});
test('row state is arc while crawling, dot while unopened, none after open', () => {
  const posts = buildCollectionPosts([session('s', [done('ready'), item('busy', { status: 'queued', descriptor: descriptor({ post_url: 'https://www.threads.com/@a/post/busy' }) })], 'topic')]);
  const state = (opened: Record<string, string>) => buildCollectionArrivalModel(posts, {}, opened, now, false).states;
  const ready = posts.find(p => p.memberships[0].itemId === 'ready')!.key;
  const busy = posts.find(p => p.memberships[0].itemId === 'busy')!.key;
  assert.equal(state({})[busy], 'arc');
  assert.equal(state({})[ready], 'dot');
  assert.equal(state({ ready: iso() })[ready], 'none');
});
test('opened records round trip and independent writes preserve other items', async () => {
  const values: Record<string, unknown> = {};
  const storage = { get: async () => ({ ...values }), set: async (v: Record<string, unknown>) => { Object.assign(values, v); } };
  await Promise.all([markReadingOpened(storage, 'a', iso()), markReadingOpened(storage, 'b', iso())]);
  assert.deepEqual(await loadOpenedReadings(storage), { a: iso(), b: iso() });
  values[OPENED_READING_PREFIX + 'bad'] = 'invalid';
  assert.deepEqual(await loadOpenedReadings(storage), { a: iso(), b: iso() });
});

test('a newer capture restores the unread dot and stale running readings cannot hold it busy', () => {
  const current = done('a');
  const posts = buildCollectionPosts([session('s', [current], 'topic')]);
  const model = buildCollectionArrivalModel(posts, { a: { status: 'running', itemId: 'a', captureId: 'old-capture', startedAt: iso() } }, { a: iso(-1000) }, now, false);
  assert.equal(model.states[posts[0].key], 'dot');
});
test('strip excludes future completion, invalid time and unfinished analysis', () => {
  const future = done('future', 1000);
  const pending = done('pending');
  pending.latestCapture!.analysis = null;
  const invalid = done('invalid');
  invalid.completedAt = 'bad';
  invalid.latestCapture!.analysis!.generated_at = 'bad';
  const model = buildCollectionArrivalModel(buildCollectionPosts([session('s', [future, pending, invalid], 'topic')]), {}, {}, now, false);
  assert.deepEqual(model.recent, []);
  assert.equal(model.states[model.posts.find(p => p.memberships[0].itemId === 'pending')!.key], 'arc');
});
