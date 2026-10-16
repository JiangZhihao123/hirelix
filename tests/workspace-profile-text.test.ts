import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileText } from "../src/components/workspace/profile-text";

Object.assign(globalThis, { React });

test("long profile keeps every source detail behind an accessible disclosure", () => {
  const text = "Documented experience. ".repeat(30) + "Final source detail.";
  const html = renderToStaticMarkup(React.createElement(ProfileText, { text }));
  assert.ok(html.includes(text));
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /line-clamp-4/);
  const target = html.match(/aria-controls="([^"]+)"/)?.[1];
  assert.ok(target);
  assert.ok(html.includes(`id="${target}"`));
  assert.match(html, /Show more/);
});

test("short profile is readable without an unnecessary disclosure", () => {
  const html = renderToStaticMarkup(React.createElement(ProfileText, { text: "Built and operated ML services." }));
  assert.match(html, /Built and operated ML services/);
  assert.doesNotMatch(html, /button|line-clamp/);
});

test("short multiline profile is collapsed without losing its lines", () => {
  const text = "One\nTwo\nThree\nFour\nFive";
  const html = renderToStaticMarkup(React.createElement(ProfileText, { text }));
  assert.ok(html.includes(text));
  assert.match(html, /line-clamp-4/);
  assert.match(html, /aria-expanded="false"/);
});
