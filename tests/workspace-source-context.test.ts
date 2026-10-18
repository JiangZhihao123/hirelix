import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWorkspaceHref, viewedSourceFromHref } from "../src/lib/workspace/source-context";
const role = "60c7ae18-23da-45cd-93c4-bdd3a1f7c529",
  item = "e6f486e9-0e37-4f73-b416-fd60ea5122f8";
test("source context recognizes actual document, record, candidate, role and file targets", () => {
  assert.deepEqual(viewedSourceFromHref(`/app/roles/${role}/updates/${item}`), {
    kind: "deliverable",
    id: item,
  });
  assert.deepEqual(viewedSourceFromHref(`/app/submissions/${item}`), {
    kind: "deliverable",
    id: item,
  });
  assert.deepEqual(
    viewedSourceFromHref(`/app/roles/${role}?record=${item}&tab=activity`),
    { kind: "record", id: item },
  );
  assert.deepEqual(
    viewedSourceFromHref(`/app/candidates?person=${role}&record=${item}`),
    { kind: "record", id: item },
  );
  assert.deepEqual(viewedSourceFromHref(`/app/candidates?person=${item}`), {
    kind: "person",
    id: item,
  });
  assert.deepEqual(viewedSourceFromHref(`/app/roles/${role}`), {
    kind: "role",
    id: role,
  });
  assert.deepEqual(viewedSourceFromHref(`/api/workspace/files/${item}`), {
    kind: "file",
    id: item,
  });
});
test("external links, unknown routes and invalid IDs cannot select private workspace context", () => {
  for (const href of [
    `https://example.com/app/submissions/${item}`,
    `//example.com/app/roles/${role}`,
    `/app/documents?document=${item}`,
    `/app/submissions/not-a-uuid`,
    `/app/candidates?person=invalid`,
    `/app/roles/${role}?record=invalid`,
  ])
    assert.equal(viewedSourceFromHref(href), null, href);
});


test("generated application hosts resolve only to exact trusted source paths", () => {
  const path = `/app/submissions/${item}`;
  assert.equal(resolveWorkspaceHref(`https://invented.example${path}`, [path]), path);
  assert.equal(resolveWorkspaceHref(`https://invented.example${path}#section`, [path]), `${path}#section`);
  assert.equal(resolveWorkspaceHref(path, [path]), path);
  for (const href of [`https://example.com${path}?other=1`, `https://example.com/app/submissions/${role}`, "https://example.com/article"]) assert.equal(resolveWorkspaceHref(href,[path]),href);
  assert.equal(resolveWorkspaceHref(`https://invented.example${path}`, []), `https://invented.example${path}`);
  assert.equal(resolveWorkspaceHref('https://example.com/article', ['/article']), 'https://example.com/article');
});


test("published client links resolve from an exact trusted publication receipt", () => {
  const link = `/recommendation/${item}.${"a".repeat(43)}`;
  assert.equal(resolveWorkspaceHref(`https://invented.example${link}`, [link]), link);
  assert.equal(resolveWorkspaceHref(`https://invented.example${link}`, []), `https://invented.example${link}`);
  assert.equal(resolveWorkspaceHref(`https://invented.example${link}/feedback`, [link]), `https://invented.example${link}/feedback`);
});
