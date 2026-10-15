import test from "node:test";
import assert from "node:assert/strict";
import {
  pageRecommendations,
  type RecommendationRole,
} from "../src/lib/workspace/recommendations-contract";
import {
  recommendationListOptions,
  roleListOptions,
} from "../src/lib/workspace/list-options";

test("recommendations filter and order the entire collection before pagination; missing dates remain last", () => {
  const roles = Array.from(
    { length: 55 },
    (_, i) =>
      ({
        role: {
          id: String(i).padStart(3, "0"),
          title: `Role ${String(i).padStart(3, "0")}`,
          client_name: "Client",
        },
        people: [{ id: "p", name: i === 54 ? "Needle" : "Person" }],
        recommended_count: i,
        last_delivery: i ? new Date(Date.UTC(2026, 0, i)).toISOString() : null,
        feedback: [],
        materials: [],
        events: [],
      }) as unknown as RecommendationRole,
  );
  const first = pageRecommendations(
    { roles },
    recommendationListOptions.parse({ sort: "count" }),
  );
  assert.equal(first.total, 55);
  assert.equal(first.roles[0].recommended_count, 54);
  assert.equal(first.roles.length, 50);
  const second = pageRecommendations(
    { roles },
    recommendationListOptions.parse({ sort: "count", page: 2 }),
  );
  assert.deepEqual(
    second.roles.map((r) => r.recommended_count),
    [4, 3, 2, 1, 0],
  );
  const matching = pageRecommendations(
    { roles },
    recommendationListOptions.parse({ q: "needle", filter: "recommended" }),
  );
  assert.equal(matching.total, 1);
  assert.equal(matching.roles[0].role.id, "054");
  const ascending = pageRecommendations(
    { roles },
    recommendationListOptions.parse({
      sort: "delivery",
      direction: "asc",
      page: 2,
    }),
  );
  assert.equal(ascending.roles.at(-1)?.last_delivery, null);
  const empty = pageRecommendations(
    { roles },
    recommendationListOptions.parse({ q: "needle", filter: "preparing" }),
  );
  assert.equal(empty.total, 0);
});
test("list request parameters reject unbounded pages and unknown sort expressions", () => {
  assert.equal(
    roleListOptions.safeParse({ sort: "title; DROP TABLE users" }).success,
    false,
  );
  assert.equal(roleListOptions.safeParse({ page: -1 }).success, false);
  assert.equal(
    recommendationListOptions.safeParse({ page: 100001 }).success,
    false,
  );
});
