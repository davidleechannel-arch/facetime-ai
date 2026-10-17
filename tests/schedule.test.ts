import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRun, zonedToUtc, describeSchedule } from "../src/lib/schedule.ts";

const NY = "America/New_York";

test("daily 8:00 in New York resolves to 12:00 UTC during EDT", () => {
  const after = Date.UTC(2026, 9, 17, 14, 0); // Oct 17 10:00 EDT
  assert.equal(new Date(nextRun({ type: "daily", time: "08:00" }, NY, after)!).toISOString(), "2026-10-18T12:00:00.000Z");
});

test("daily later the same day stays today", () => {
  const after = Date.UTC(2026, 9, 17, 14, 0);
  assert.equal(new Date(nextRun({ type: "daily", time: "20:30" }, NY, after)!).toISOString(), "2026-10-18T00:30:00.000Z");
});

test("crosses the DST change (EDT -> EST on Nov 1 2026)", () => {
  const after = Date.UTC(2026, 9, 31, 20, 0);
  const sat = nextRun({ type: "daily", time: "08:00" }, NY, Date.UTC(2026, 10, 1, 13, 30))!;
  assert.equal(new Date(sat).toISOString(), "2026-11-02T13:00:00.000Z"); // 8:00 EST = 13:00 UTC
  assert.equal(new Date(nextRun({ type: "daily", time: "08:00" }, NY, after)!).toISOString(), "2026-11-01T13:00:00.000Z");
});

test("weekly picks the next matching weekday", () => {
  const after = Date.UTC(2026, 9, 17, 14, 0); // Saturday
  const t = nextRun({ type: "weekly", time: "18:00", days: [5] }, NY, after)!; // Friday
  assert.equal(new Date(t).toISOString(), "2026-10-23T22:00:00.000Z");
});

test("once in the past returns null", () => {
  assert.equal(nextRun({ type: "once", at: "2026-01-01T09:00" }, NY, Date.UTC(2026, 9, 17)), null);
});

test("Seoul has no DST", () => {
  assert.equal(new Date(zonedToUtc(2026, 10, 18, 8, 0, "Asia/Seoul")).toISOString(), "2026-10-17T23:00:00.000Z");
});

test("describes schedules in plain words", () => {
  assert.equal(describeSchedule({ type: "daily", time: "08:00" }), "Every day at 8:00 AM");
  assert.equal(describeSchedule({ type: "weekly", time: "17:30", days: [1, 2, 3, 4, 5] }), "Weekdays at 5:30 PM");
});
