import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Blockquote } from 'mdast';
import { suggestionLayout } from '../src/lib/workspace/suggestion-layout';

function layout(source: string) {
  const tree = unified().use(remarkParse).parse(source);
  suggestionLayout()(tree);
  return tree;
}

test('inline and separate descriptions are omitted from reply controls', () => {
  const sources = [
    '[处理资料](#assistant-reply) 说明文字',
    '[处理资料](#assistant-reply)\n说明文字',
    '[处理资料](#assistant-reply)\n\n说明文字',
  ];
  for (const source of sources) {
    const tree = layout(source);
    assert.equal(tree.children.length, 1);
    const option = tree.children[0] as Blockquote;
    assert.equal(option.data?.hName, 'div');
    assert.equal(option.children.length, 1);
    assert.equal(option.children[0].type, 'paragraph');
  }
});

test('multiple options in one paragraph are separated and preserve navigation-shaped legacy replies', () => {
  const tree = layout('说明\n\n[行动一](/app/roles) 描述一\n[行动二](#assistant-reply) 描述二\n\n### 正文');
  assert.deepEqual(tree.children.map(node => node.type), ['paragraph', 'blockquote', 'blockquote', 'heading']);
  for (const node of tree.children.slice(1, 3) as Blockquote[]) assert.equal(node.children.length, 1);
});

test('ordinary prose and incomplete links are kept as text, not actionable options', () => {
  const tree = layout('说明与 `代码`。\n\n[尚在生成](#assistant-');
  assert.ok(tree.children.every(node => node.type === 'paragraph'));
});
