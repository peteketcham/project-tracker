import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSchedule } from "../src/lib/scheduler/engine";
import type {
  SchedulerDependency,
  SchedulerTask,
  WorkingCalendarSettings,
} from "../src/lib/scheduler/types";

// Monday 2026-11-09, 09:00 local time
const local = (s: string) => new Date(s);
const settings: WorkingCalendarSettings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
  defaultSetupMinutes: 15,
  defaultTakedownMinutes: 10,
  projectStartDate: local("2026-11-09T09:00:00"),
};
const T = (id: string, over: Partial<SchedulerTask> = {}): SchedulerTask => ({
  id,
  title: id,
  status: "SCHEDULED",
  priority: "MEDIUM",
  baseDurationMinutes: 60,
  setupMinutes: 0,
  takedownMinutes: 0,
  constraintType: "ASAP",
  ...over,
});
const fs = (a: string, b: string, lagMinutes = 0): SchedulerDependency => ({
  id: `${a}-${b}`,
  predecessorId: a,
  successorId: b,
  type: "FS",
  lagMinutes,
});
const byId = (r: ReturnType<typeof calculateSchedule>) => new Map(r.tasks.map((t) => [t.id, t]));

test("001/US1.1: setup + work + takedown inside one working day", () => {
  const r = calculateSchedule(
    [T("a", { setupMinutes: 15, baseDurationMinutes: 120, takedownMinutes: 15 })],
    [],
    settings
  );
  const a = byId(r).get("a")!;
  assert.deepEqual(a.earlyStart, local("2026-11-09T09:00:00"));
  assert.deepEqual(a.earlyFinish, local("2026-11-09T11:30:00"));
  assert.deepEqual(r.projectEnd, local("2026-11-09T11:30:00"));
});

test("001/US1.2: a finish-to-start successor follows its predecessor", () => {
  const short = byId(calculateSchedule([T("a"), T("b")], [fs("a", "b")], settings)).get("b")!;
  const long = byId(
    calculateSchedule([T("a", { baseDurationMinutes: 150 }), T("b")], [fs("a", "b")], settings)
  ).get("b")!;
  assert.deepEqual(short.earlyStart, local("2026-11-09T10:00:00"));
  assert.deepEqual(long.earlyStart, local("2026-11-09T11:30:00"));
});

test("001/US1.3: work wraps to the next working day and skips the weekend", () => {
  const friday = { ...settings, projectStartDate: local("2026-11-13T15:00:00") };
  const a = byId(calculateSchedule([T("a", { baseDurationMinutes: 180 })], [], friday)).get("a")!;
  assert.deepEqual(a.earlyFinish, local("2026-11-16T10:00:00")); // Monday
});

test("001/US4.1: the chain that sets the finish date is critical, the side task has float", () => {
  const r = calculateSchedule(
    [T("a", { baseDurationMinutes: 120 }), T("b", { baseDurationMinutes: 120 }), T("side")],
    [fs("a", "b")],
    { ...settings, levelResources: false } as WorkingCalendarSettings
  );
  const m = byId(r);
  assert.equal(m.get("a")!.isCritical, true);
  assert.equal(m.get("b")!.isCritical, true);
  assert.equal(m.get("side")!.isCritical, false);
  assert.equal(m.get("side")!.totalFloatMinutes, 180);
});

test("001/US4.2: finished tasks are never critical", () => {
  const r = calculateSchedule([T("a", { status: "DONE" })], [], settings);
  assert.equal(r.tasks[0].isCritical, false);
});
