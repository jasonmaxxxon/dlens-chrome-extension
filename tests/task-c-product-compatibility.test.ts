import assert from 'node:assert/strict';
import test from 'node:test';
import {readCommentEligibility} from '../src/compare/comment-eligibility';
import {buildProductReaderModel} from '../src/viewmodel/product-reader';
import {createDefaultSettings} from '../src/state/types';
import {item as makeItem,capture,descriptor} from './collection-browser.fixtures';

test('a corroborated OP handle that resembles a UI word remains explanatory context in the product reader',()=>{
 const item=makeItem('p',{status:'succeeded',descriptor:descriptor({post_url:'https://www.threads.com/@author/post/ROOT',author_hint:'author'}),latestCapture:capture({}, {result:{...capture().result!,canonical_post:{post_id:'ROOT',author:'author',text:'原文'},comments:[{comment_id:'ROOT',author:'author',text:'原文'},{comment_id:'op-extra',author:'author',text:'作者補充'},{comment_id:'fan',author:'fan',text:'點樣用？',like_count:3}]}})});
 const eligibility=readCommentEligibility(item);
 assert.equal(eligibility.authorContinuations.length,1);
 assert.equal(eligibility.authorReplies.length,0);
 assert.deepEqual(eligibility.audience.map(c=>c.id),['fan']);
 const model=buildProductReaderModel(item,'s',null,undefined,createDefaultSettings(),false);
 assert.deepEqual(model.replies.map(c=>c.text),['作者補充','點樣用？']);
 assert.equal(model.replies[0].isAuthor,true);
});
