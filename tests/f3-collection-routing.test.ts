import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCollectionArrivalModel, buildCollectionFilters, buildCollectionPosts, parseLibrarySearchTokens } from '../src/viewmodel/collection-browser.ts';
import { getModeHomePage, guardPage } from '../src/state/processing-state.ts';
import { isKnownPage } from '../src/state/page-registry.ts';
import { item, session } from './collection-browser.fixtures.ts';

test('archive chip exists for an empty workspace and counts deduplicated posts across all archive sessions', () => {
  const empty = session('empty', [], 'archive');
  const a = session('a', [item('one')], 'archive');
  const b = session('b', [item('duplicate'), item('two', { descriptor: { ...item('two').descriptor, post_url: 'https://www.threads.com/@test/post/two' } })], 'archive');
  const posts = buildCollectionPosts([a, b]);
  const arrival = buildCollectionArrivalModel(posts, {}, {}, 0);
  assert.equal(buildCollectionFilters([], buildCollectionArrivalModel([], {}, {}, 0), 'all', [empty]).chips.find(c => c.key === 'archive')?.count, 0);
  const result = buildCollectionFilters(posts, arrival, 'archive', [a, b]);
  assert.equal(result.chips.find(c => c.key === 'archive')?.count, 2);
  assert.equal(result.posts.length, 2);
  assert.equal(buildCollectionFilters([], buildCollectionArrivalModel([], {}, {}, 0), 'all', []).chips.some(c => c.key === 'archive'), false);
});

test('retired routes resolve to retained homes without registry exceptions', () => {
  for (const route of ['topic-detail', 'audit-report', 'library', 'compare', 'result', 'signals', 'collect'] as const) {
    assert.equal(isKnownPage(route), false);
    assert.equal(guardPage(route, 'archive'), 'collection');
    assert.equal(guardPage(route, 'product'), 'collection');
    assert.equal(guardPage(route, 'topic'), 'topics');
    assert.equal(guardPage(route, 'pr-evidence'), 'pr-evidence');
  }
  assert.equal(getModeHomePage('product'), 'collection');
});

test('collection keeps local AND search token parsing after Library removal', () => {
  assert.deepEqual(parseLibrarySearchTokens(' @Author   TOOL '), ['author', 'tool']);
  assert.deepEqual(parseLibrarySearchTokens(' 粵語問題 '), ['粵語問題']);
  assert.deepEqual(parseLibrarySearchTokens(' @   '), []);
});
