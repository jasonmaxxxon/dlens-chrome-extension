import assert from "node:assert/strict";
import test from "node:test";
import { stripThreadsTranslationChrome } from "../src/state/source-text";
test("translation controls are excluded from saved excerpt display",()=> {
 assert.equal(stripThreadsTranslationChrome("Translated from Chinese ·\nSee original\n原帖內容"),"原帖內容");
 assert.equal(stripThreadsTranslationChrome("Translated from Chinese See original I want to learn."),"I want to learn.");
});
test("normal prose referring to translation stays intact",()=> {
 const text='I clicked See original to compare.\nThis was translated from Chinese by a friend.';
 assert.equal(stripThreadsTranslationChrome(text),text);
});

test("standalone phrases inside a post remain part of the source", () => {
 const source="The button says:\nSee original\nTranslation settings";
 assert.equal(stripThreadsTranslationChrome(source), source);
});
