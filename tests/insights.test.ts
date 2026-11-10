import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInsights, type InsightTask } from "../src/lib/insights";

const now = new Date("2026-11-12T18:00:00Z"); // Thursday
const at = (s: string) => new Date(`2026-11-${s}:00Z`);
const work = (start: string, minutes: number) => ({
  sessionType: "WORK",
  startTime: at(start),
  endTime: new Date(at(start).getTime() + minutes * 60_000),
  durationMinutes: minutes,
});
const pause = (pausedAt: string, reason: string | null, resumedAt?: string) => ({
  pausedAt: at(pausedAt),
  resumedAt: resumedAt ? at(resumedAt) : null,
  reason,
  overheadAddedMinutes: 25,
});
const task = (over: Partial<InsightTask>): InsightTask => ({
  id: "t",
  title: "t",
  status: "SCHEDULED",
  baseDurationMinutes: 60,
  workSessions: [],
  interruptionLogs: [],
  ...over,
});

test("004/US1: interruptions are totalled, grouped by reason and by week", () => {
  const r = computeInsights(
    [
      task({
        id: "a",
        title: "Tile",
        interruptionLogs: [
          pause("10T10:00", "phone call", "10T10:30"),
          pause("11T10:00", "Phone  call ", "11T11:30"),
          pause("01T10:00", null),
        ],
      }),
      task({ id: "b", title: "Grout", interruptionLogs: [pause("12T09:00", "delivery")] }),
    ],
    now
  );
  assert.equal(r.interruptions.total, 4);
  assert.equal(r.interruptions.last7Days, 3);
  assert.equal(r.interruptions.overheadMinutesTotal, 100);
  assert.equal(r.interruptions.overheadMinutesLast7Days, 75);
  assert.equal(r.interruptions.averageAwayMinutes, 60);
  assert.deepEqual(r.interruptions.byReason[0], { reason: "Phone call", count: 2, overheadMinutes: 50 });
  assert.ok(r.interruptions.byReason.some((x) => x.reason === "No reason given"));
  assert.equal(r.interruptions.byWeek.length, 8);
  assert.deepEqual(r.interruptions.byWeek.at(-1), { weekStart: "2026-11-09", count: 3, overheadMinutes: 75 });
  assert.equal(r.interruptions.mostInterrupted[0].taskId, "a");
});

test("004/US2: estimate accuracy uses measured focused work on finished tasks only", () => {
  const done = (id: string, planned: number, actual: number) =>
    task({ id, title: id, status: "DONE", baseDurationMinutes: planned, workSessions: [work("10T09:00", actual)] });
  const r = computeInsights(
    [
      done("a", 60, 90),
      done("b", 60, 75),
      done("c", 120, 150),
      task({ id: "open", workSessions: [work("10T09:00", 500)] }), // not finished: ignored
      task({ id: "untracked", status: "DONE" }), // no measurements: ignored
    ],
    now
  );
  assert.equal(r.estimates.sampleSize, 3);
  assert.equal(r.estimates.plannedMinutes, 240);
  assert.equal(r.estimates.actualMinutes, 315);
  assert.equal(r.estimates.ratio, 1.31);
  assert.match(r.estimates.suggestion ?? "", /31% longer/);
  assert.equal(r.estimates.tasks[0].taskId, "a");
  assert.equal(r.focus.stretches, 4);
});

test("004/US2: no suggestion from fewer than three finished tasks; empty data is safe", () => {
  const empty = computeInsights([], now);
  assert.equal(empty.estimates.ratio, null);
  assert.equal(empty.estimates.suggestion, null);
  assert.equal(empty.focus.averageStretchMinutes, null);
  assert.equal(empty.interruptions.averageAwayMinutes, null);
});
