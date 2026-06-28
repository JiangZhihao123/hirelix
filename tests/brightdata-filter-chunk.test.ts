import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkBrightDataFilter,
  type BrightDataFilterRule,
} from "@/lib/brightdata";

const leaf = (value: string): BrightDataFilterRule => ({
  name: "position",
  operator: "includes",
  value,
});

function maxGroupSize(filter: BrightDataFilterRule): number {
  if (!("filters" in filter)) return 1;
  const childMax = filter.filters.length;
  const nestedMax = filter.filters.reduce(
    (acc, child) => Math.max(acc, maxGroupSize(child)),
    0,
  );
  return Math.max(childMax, nestedMax);
}

function maxGroupDepth(filter: BrightDataFilterRule): number {
  if (!("filters" in filter)) return 0;
  if (filter.filters.length === 0) return 1;
  return (
    1 +
    filter.filters.reduce(
      (acc, child) => Math.max(acc, maxGroupDepth(child)),
      0,
    )
  );
}

function flattenLeafValues(filter: BrightDataFilterRule): string[] {
  if (!("filters" in filter)) return [String(filter.value)];
  return filter.filters.flatMap((child) => flattenLeafValues(child));
}

test("leaf rules are returned unchanged", () => {
  const input = leaf("Python");
  assert.deepEqual(chunkBrightDataFilter(input), input);
});

test("groups within the limit are unchanged", () => {
  const input: BrightDataFilterRule = {
    operator: "or",
    filters: [leaf("a"), leaf("b"), leaf("c"), leaf("d")],
  };
  assert.deepEqual(chunkBrightDataFilter(input), input);
});

test("groups beyond the limit get split into nested same-operator groups", () => {
  const input: BrightDataFilterRule = {
    operator: "or",
    filters: [leaf("a"), leaf("b"), leaf("c"), leaf("d"), leaf("e"), leaf("f"), leaf("g")],
  };
  const result = chunkBrightDataFilter(input);
  assert.equal(maxGroupSize(result), 4);
  assert.deepEqual(flattenLeafValues(result).sort(), ["a", "b", "c", "d", "e", "f", "g"].sort());
  assert("filters" in result);
  assert.equal(result.operator, "or");
});

test("AND group with 6 children gets chunked into nested AND groups", () => {
  const input: BrightDataFilterRule = {
    operator: "and",
    filters: [leaf("t"), leaf("c"), leaf("s"), leaf("l"), leaf("q1"), leaf("q2")],
  };
  const result = chunkBrightDataFilter(input);
  assert.equal(maxGroupSize(result), 4);
  assert("filters" in result);
  assert.equal(result.operator, "and");
});

test("nested groups with the same operator are flattened then re-chunked", () => {
  const input: BrightDataFilterRule = {
    operator: "or",
    filters: [
      leaf("a"),
      leaf("b"),
      leaf("c"),
      leaf("d"),
      leaf("e"),
      { operator: "or", filters: [leaf("f"), leaf("g")] },
    ],
  };
  const result = chunkBrightDataFilter(input);
  assert.equal(maxGroupSize(result), 4);
  assert.deepEqual(flattenLeafValues(result).sort(), ["a", "b", "c", "d", "e", "f", "g"].sort());
});

test("groups with different operators are NOT flattened", () => {
  const input: BrightDataFilterRule = {
    operator: "and",
    filters: [
      leaf("country"),
      { operator: "or", filters: [leaf("a"), leaf("b"), leaf("c")] },
    ],
  };
  const result = chunkBrightDataFilter(input);
  assert("filters" in result);
  assert.equal(result.operator, "and");
  assert.equal(result.filters.length, 2);
  const orChild = result.filters.find(
    (f) => "filters" in f && f.operator === "or",
  );
  assert(orChild && "filters" in orChild);
  assert.equal(orChild.filters.length, 3);
});

test("deeply nested groups with multiple over-limit groups all get chunked", () => {
  const input: BrightDataFilterRule = {
    operator: "and",
    filters: [
      // 8-rule OR group (over limit)
      {
        operator: "or",
        filters: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"].map(leaf),
      },
      // 16-rule OR group (over limit, but with mixed names — won't be flattened with above)
      {
        operator: "or",
        filters: Array.from({ length: 16 }, (_, i) => leaf(`s${i}`)),
      },
      // 6 quality-style rules under one AND-of-OR (different operator → not flattened with root AND)
      {
        operator: "or",
        filters: ["q1", "q2", "q3", "q4", "q5", "q6"].map(leaf),
      },
    ],
  };
  const result = chunkBrightDataFilter(input);
  assert.equal(maxGroupSize(result), 4, "every group must have at most 4 children");
});

test("chunking is idempotent (running it twice yields the same shape)", () => {
  const input: BrightDataFilterRule = {
    operator: "or",
    filters: Array.from({ length: 17 }, (_, i) => leaf(`v${i}`)),
  };
  const once = chunkBrightDataFilter(input);
  const twice = chunkBrightDataFilter(once);
  assert.deepEqual(once, twice);
  assert.equal(maxGroupSize(once), 4);
});

test("empty group stays empty", () => {
  const input: BrightDataFilterRule = { operator: "and", filters: [] };
  const result = chunkBrightDataFilter(input);
  assert.deepEqual(result, { operator: "and", filters: [] });
});

test("custom maxPerGroup is respected", () => {
  const input: BrightDataFilterRule = {
    operator: "or",
    filters: Array.from({ length: 10 }, (_, i) => leaf(`v${i}`)),
  };
  const result = chunkBrightDataFilter(input, 3);
  assert.equal(maxGroupSize(result), 3);
  assert.deepEqual(
    flattenLeafValues(result).sort(),
    Array.from({ length: 10 }, (_, i) => `v${i}`).sort(),
  );
});

test("respects maxDepth and truncates rather than nesting past the limit", () => {
  // 128 leaves would need 4 levels (4^4=256) but maxDepth=3 caps at 4^3=64
  // so we expect truncation at the top-level group.
  const input: BrightDataFilterRule = {
    operator: "or",
    filters: Array.from({ length: 128 }, (_, i) => leaf(`v${i}`)),
  };
  const result = chunkBrightDataFilter(input);
  assert.ok(maxGroupDepth(result) <= 3, `depth must be <= 3, got ${maxGroupDepth(result)}`);
  assert.equal(maxGroupSize(result), 4);
});

test("root AND with nested over-limit OR respects both constraints", () => {
  // Simulates the production topology that just failed: root AND contains
  // an outer OR (balanced skill filter) which contains two inner ORs with 16 leaves each.
  const makeInnerOr = (prefix: string): BrightDataFilterRule => ({
    operator: "or",
    filters: Array.from({ length: 16 }, (_, i) => ({
      name: i % 2 === 0 ? "about" : "position",
      operator: "includes" as const,
      value: `${prefix}-${i}`,
    })),
  });
  const root: BrightDataFilterRule = {
    operator: "and",
    filters: [
      { operator: "or", filters: [makeInnerOr("search"), makeInnerOr("platform")] },
      { name: "country_code", operator: "=", value: "US" },
      { name: "default_avatar", operator: "=", value: false },
    ],
  };
  const result = chunkBrightDataFilter(root);
  assert.ok(
    maxGroupDepth(result) <= 3,
    `depth must be <= 3, got ${maxGroupDepth(result)}`,
  );
  assert.equal(maxGroupSize(result), 4);
});

test("realistic recall filter shape (mirrors the production failure case)", () => {
  // Reproduces approximately what buildBrightDataRecallFilter produces for a
  // dense Senior Backend Engineer JD. Before the fix, this tripped 4 separate
  // "max 4 rules" violations from Bright Data.
  const titleFilter: BrightDataFilterRule = {
    operator: "or",
    filters: Array.from({ length: 8 }, (_, i) => ({
      name: "position",
      operator: "includes",
      value: `title-${i}`,
    })),
  };
  const skillFilter: BrightDataFilterRule = {
    operator: "or",
    filters: [
      {
        operator: "or",
        filters: Array.from({ length: 16 }, (_, i) => ({
          name: i % 2 === 0 ? "about" : "position",
          operator: "includes",
          value: `search-domain-${i}`,
        })),
      },
      {
        operator: "or",
        filters: Array.from({ length: 16 }, (_, i) => ({
          name: i % 2 === 0 ? "about" : "position",
          operator: "includes",
          value: `platform-${i}`,
        })),
      },
    ],
  };
  const root: BrightDataFilterRule = {
    operator: "and",
    filters: [
      titleFilter,
      { name: "country_code", operator: "=", value: "US" },
      skillFilter,
      {
        operator: "or",
        filters: ["sf", "ny", "la", "seattle", "austin"].map((value) => ({
          name: "location",
          operator: "includes",
          value,
        })),
      },
      { name: "default_avatar", operator: "=", value: false },
      { name: "connections", operator: ">=", value: 50 },
    ],
  };

  const result = chunkBrightDataFilter(root);
  assert.equal(maxGroupSize(result), 4);
  assert.ok(
    maxGroupDepth(result) <= 3,
    `depth must be <= 3, got ${maxGroupDepth(result)}`,
  );
});

test("headhunter pair evidence filter is truncated instead of nested past Bright depth", () => {
  const pairEvidence: BrightDataFilterRule = {
    operator: "or",
    filters: Array.from({ length: 6 }, (_, index) => ({
      operator: "and" as const,
      filters: [
        {
          name: index % 2 === 0 ? "position" : "about",
          operator: "includes" as const,
          value: "backend",
        },
        {
          name: index % 3 === 0 ? "position" : "about",
          operator: "includes" as const,
          value: `payments-${index}`,
        },
      ],
    })),
  };
  const root: BrightDataFilterRule = {
    operator: "and",
    filters: [
      {
        operator: "or",
        filters: ["senior backend engineer", "staff backend engineer", "senior software engineer"].map((value) => ({
          name: "position",
          operator: "includes",
          value,
        })),
      },
      pairEvidence,
      {
        operator: "or",
        filters: ["US", "CA", "GB", "DE"].map((value) => ({
          name: "country_code",
          operator: "=",
          value,
        })),
      },
      { name: "default_avatar", operator: "=", value: false },
      { name: "connections", operator: ">=", value: 50 },
    ],
  };

  const result = chunkBrightDataFilter(root);
  assert.equal(maxGroupSize(result), 4);
  assert.ok(
    maxGroupDepth(result) <= 3,
    `depth must be <= 3, got ${maxGroupDepth(result)}`,
  );
  assert.deepEqual(
    flattenLeafValues(result).filter((value) => String(value).startsWith("payments-")).sort(),
    ["payments-0", "payments-1", "payments-2", "payments-3"].sort(),
  );
});
