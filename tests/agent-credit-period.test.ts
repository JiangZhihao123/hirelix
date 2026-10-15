import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionCreditPeriod, subscriptionMonth } from "../src/lib/agent-credit-period";
const date = (s: string) => new Date(s);
test("monthly allowance follows the paid interval, not the first of a month", () => {
  const start=date('2026-10-15T08:20:00Z'),end=date('2026-11-15T08:20:00Z');
  assert.deepEqual(subscriptionCreditPeriod(start,end,date('2026-11-01T00:00:00Z'),false),{start,end});
  assert.equal(subscriptionCreditPeriod(start,end,end,false),null);
  assert.equal(subscriptionCreditPeriod(start,end,date('2026-10-14T00:00:00Z'),false),null);
});
test("annual windows clamp February and return to the original day in March", () => {
 const start=date('2026-01-31T09:15:00Z'),end=date('2027-01-31T09:15:00Z');
 assert.equal(subscriptionMonth(start,1).toISOString(),'2026-02-28T09:15:00.000Z');
 assert.equal(subscriptionMonth(start,2).toISOString(),'2026-03-31T09:15:00.000Z');
 assert.deepEqual(subscriptionCreditPeriod(start,end,date('2026-02-28T09:15:00Z'),true),{start:date('2026-02-28T09:15:00Z'),end:date('2026-03-31T09:15:00Z')});
 assert.equal(subscriptionCreditPeriod(start,end,end,true),null);
});
test("leap-year anniversary stays anchored across annual renewals",()=>{
 const anchor=date('2024-02-29T10:00:00Z');
 assert.deepEqual(subscriptionCreditPeriod(date('2025-02-28T10:00:00Z'),date('2026-02-28T10:00:00Z'),date('2025-03-01T10:00:00Z'),true,anchor),{start:date('2025-02-28T10:00:00Z'),end:date('2025-03-29T10:00:00Z')});
});
test("invalid periods fail closed and annual windows cannot exceed the paid end",()=>{
 assert.equal(subscriptionCreditPeriod(new Date('invalid'),date('2027-01-01'),date('2026-06-01'),true),null);
 assert.deepEqual(subscriptionCreditPeriod(date('2026-01-31'),date('2026-03-15'),date('2026-03-01'),true),{start:date('2026-02-28'),end:date('2026-03-15')});
});
