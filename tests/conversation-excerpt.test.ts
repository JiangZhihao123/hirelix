import assert from "node:assert/strict";
import test from "node:test";
import { conversationExcerpt } from "../src/lib/workspace/conversation-excerpt";

test("search excerpts retain visible Markdown text without formatting or link destinations", () => {
  const content = "## **Review**\n\n- Read [the profile](/app/candidates?person=123) and `notes`.\n- ~~Earlier~~ **Current** facts.\n\n![Chart](https://example.com/chart.png)";
  assert.equal(conversationExcerpt(content, "profile"), "Review Read the profile and notes. Earlier Current facts. Chart");
});

test("parses complete messages before centering a snippet on a visible match", () => {
  const content = `${"Earlier context. ".repeat(30)}[**Target phrase**](https://example.com/${"long-path".repeat(40)}) followed by ${"more evidence ".repeat(30)}`;
  const excerpt = conversationExcerpt(content, "TARGET PHRASE")!;
  assert.ok(excerpt.includes("Target phrase"));
  assert.ok(excerpt.startsWith("…"));
  assert.ok(excerpt.endsWith("…"));
  assert.ok(excerpt.length <= 172);
  assert.ok(!excerpt.includes("long-path"));
  assert.ok(!excerpt.includes("**"));
});

test("keeps boundaries in tables, lists and line breaks, and resolves reference labels", () => {
  assert.equal(conversationExcerpt("| Name | Status |\n| --- | --- |\n| Alex | Confirmed |\n\n[Source][s]  \nNext line\n\n[s]: https://example.com", "Alex"), "Name Status Alex Confirmed Source Next line");
});

test("preserves literal punctuation, code and multilingual content", () => {
  assert.equal(conversationExcerpt("C++ / C# — 5 > 3; 你好。\\*literal\\* &amp; `a_b`", "你好"), "C++ / C# — 5 > 3; 你好。*literal* & a_b");
  assert.equal(conversationExcerpt("", "anything"), null);
  assert.equal(conversationExcerpt("[ref]: https://example.com", "ref"), null);
});
