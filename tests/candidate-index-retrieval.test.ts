import assert from "node:assert/strict";
import test from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import { buildProfileEligibilitySql } from "@/lib/candidate-index/retrieval";

test("profile eligibility omits unknown optional filters without malformed SQL", () => {
  const query = new PgDialect().sqlToQuery(buildProfileEligibilitySql({
    searchDocument: "machine learning",
    lexicalQuery: "machine learning",
    allowedCountries: ["US"],
    minimumYearsExperience: 2,
  }));

  assert.match(query.sql, /p\.country_code IN \(\$1\)/);
  assert.match(query.sql, /p\.years_experience >= \$2/);
  assert.doesNotMatch(query.sql, /highest_degree/);
  assert.deepEqual(query.params, ["US", 2]);
});
