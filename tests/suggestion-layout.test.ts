import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { suggestionLayout, assistantReplies } from '../src/lib/workspace/suggestion-layout';

test('reply controls and descriptions leave the prose regardless of line breaks', () => {
  for (const separator of [' ', '\n', '\n\n']) {
    const tree = unified().use(remarkParse).parse('建议先准备。\n\n[帮我准备](#assistant-reply)' + separator + '说明文字');
    suggestionLayout()(tree);
    assert.equal(tree.children.length, 1);
  }
});
test('footer gathers replies across the whole message preserving order and removing duplicates', () => {
  const text = ':::assistant-suggestion\n建议\n[帮我准备](/app/roles)\n:::\n补充说明。\n[我先补充背景](#assistant-reply)\n[帮我准备](#assistant-reply)\n[资料](https://example.com)';
  assert.deepEqual(assistantReplies(text), ['帮我准备', '我先补充背景']);
});
test('incomplete, code and ordinary navigation links are not replies', () => {
  assert.deepEqual(assistantReplies('[未完成](#assistant-'), []);
  assert.deepEqual(assistantReplies('`[代码](#assistant-reply)`\n[资料](/app/roles)'), []);
});
