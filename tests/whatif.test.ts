import { test } from "node:test";
import assert from "node:assert/strict";
import { whatIf } from "../src/lib/scheduler/whatif";
import type { SchedulerTask, WorkingCalendarSettings } from "../src/lib/scheduler/types";

const at = (s: string) => new Date(`2026-11-${s}:00Z`);

const settings: WorkingCalendarSettings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
  timezone: "UTC",
};
const T = (id: string, over: Partial<SchedulerTask> = {}): SchedulerTask => ({
  id,
  title: id,
  status: "SCHEDULED",
  priority: "MEDIUM",
  baseDurationMinutes: 60,
  setupMinutes: 15,
  takedownMinutes: 10,
  constraintType: "ASAP",
  ...over,
});
const monday10 = at("09T10:00");

test("005/US2.1: interrupting the running task shows what slips, without changing anything", () => {
  const tasks = [
    T("a", { status: "IN_PROGRESS", actualStart: at("09T09:00"), openWorkSessionStart: at("09T09:15") }),
    T("b", { order: 2 }),
  ];
  const deps = [{ id: "d", predecessorId: "a", successorId: "b", type: "FS" as const, lagMinutes: 0 }];
  const snapshot = JSON.stringify(tasks);
  const r = whatIf(tasks, deps, settings, monday10, { type: "interrupt", taskId: "a" });
  // before: 15 min work left + 10 takedown; after: 15 setup + 15 work + 10 takedown
  assert.equal(r.projectSlipMinutes, 15);
  assert.deepEqual(r.slippedTasks.map((t) => [t.taskId, t.slipMinutes]), [["a", 15], ["b", 15]]);
  assert.equal(JSON.stringify(tasks), snapshot);
});

test("005/US2.2: extending a task, taking time off, and dropping a task", () => {
  const tasks = [T("a", { order: 1 }), T("b", { order: 2 })];
  const extend = whatIf(tasks, [], settings, monday10, { type: "extend", taskId: "a", minutes: 30 });
  assert.equal(extend.projectSlipMinutes, 30);
  const off = whatIf(tasks, [], settings, monday10, {
    type: "time_off",
    start: at("09T10:00"),
    end: at("09T12:00"),
  });
  assert.equal(off.projectSlipMinutes, 120);
  const drop = whatIf(tasks, [], settings, monday10, { type: "drop", taskId: "a" });
  assert.equal(drop.projectSlipMinutes, -85);
  assert.throws(() => whatIf(tasks, [], settings, monday10, { type: "drop", taskId: "nope" }));
});

test("005/US2.3: a change that breaks a deadline reports the new conflict", () => {
  const tasks = [
    T("a", { order: 1 }),
    T("b", { order: 2, constraintType: "FINISH_NO_LATER_THAN", pinnedDate: at("09T13:00") }),
  ];
  const deps = [{ id: "d", predecessorId: "a", successorId: "b", type: "FS" as const, lagMinutes: 0 }];
  const r = whatIf(tasks, deps, settings, monday10, { type: "extend", taskId: "a", minutes: 120 });
  assert.equal(r.newConflicts[0]?.type, "DEADLINE_MISSED");
});
