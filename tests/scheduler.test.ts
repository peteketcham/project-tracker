import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSchedule } from "../src/lib/scheduler/engine";
import type {
  DependencyType,
  SchedulerDependency,
  SchedulerTask,
  WorkingCalendarSettings,
} from "../src/lib/scheduler/types";

/** All times UTC. 2026-11-09 is a Monday. */
const at = (s: string) => new Date(`2026-11-${s}:00Z`);
const MON9 = at("09T09:00");

const base: WorkingCalendarSettings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
  timezone: "UTC",
  projectStartDate: MON9,
};
const unleveled = { ...base, levelResources: false };

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
const dep = (a: string, b: string, type: DependencyType = "FS", lagMinutes = 0): SchedulerDependency => ({
  id: `${a}-${b}`,
  predecessorId: a,
  successorId: b,
  type,
  lagMinutes,
});
function run(
  tasks: SchedulerTask[],
  deps: SchedulerDependency[] = [],
  settings: WorkingCalendarSettings = base,
  now: Date = MON9
) {
  const result = calculateSchedule(tasks, deps, settings, now);
  const map = new Map(result.tasks.map((t) => [t.id, t]));
  return { result, get: (id: string) => map.get(id)! };
}

/* ------------------------------------------------- 001 core tracker */

test("001/US1.1: setup + work + takedown inside one working day", () => {
  const { result, get } = run([T("a", { setupMinutes: 15, baseDurationMinutes: 120, takedownMinutes: 15 })]);
  assert.deepEqual(get("a").earlyStart, MON9);
  assert.deepEqual(get("a").earlyFinish, at("09T11:30"));
  assert.deepEqual(result.projectEnd, at("09T11:30"));
});

test("001/US1.2: a finish-to-start successor moves when its predecessor grows", () => {
  assert.deepEqual(run([T("a"), T("b")], [dep("a", "b")]).get("b").earlyStart, at("09T10:00"));
  assert.deepEqual(
    run([T("a", { baseDurationMinutes: 150 }), T("b")], [dep("a", "b")]).get("b").earlyStart,
    at("09T11:30")
  );
});

test("001/US1.3: work wraps to the next working day and skips the weekend", () => {
  const friday = { ...base, projectStartDate: at("13T15:00") };
  const { get } = run([T("a", { baseDurationMinutes: 180 })], [], friday, at("13T15:00"));
  assert.deepEqual(get("a").earlyFinish, at("16T10:00"));
});

test("001/US1.4: each dependency type is honored, with lag and lead", () => {
  const a = T("a", { baseDurationMinutes: 120 }); // 09:00-11:00
  const ss = run([a, T("b")], [dep("a", "b", "SS", 30)], unleveled).get("b");
  assert.deepEqual(ss.earlyStart, at("09T09:30"));
  const ff = run([a, T("b")], [dep("a", "b", "FF")], unleveled).get("b");
  assert.deepEqual(ff.earlyFinish, at("09T11:00"));
  assert.deepEqual(ff.earlyStart, at("09T10:00"));
  const sf = run([a, T("b")], [dep("a", "b", "SF", 180)], unleveled).get("b");
  assert.deepEqual(sf.earlyFinish, at("09T12:00"));
  const lead = run([a, T("b")], [dep("a", "b", "FS", -30)], unleveled).get("b");
  assert.deepEqual(lead.earlyStart, at("09T10:30"));
  const lag = run([a, T("b")], [dep("a", "b", "FS", 45)], unleveled).get("b");
  assert.deepEqual(lag.earlyStart, at("09T11:45"));
});

test("001/US3.2: k interruptions cost (k+1)S + D + (k+1)T in total", () => {
  const { get } = run([
    T("a", { setupMinutes: 15, takedownMinutes: 15, interruptionCount: 2, status: "PAUSED" }),
  ]);
  assert.equal(get("a").effectiveDurationMinutes, 150);
  assert.equal(get("a").overheadMinutes, 60);
});

test("001/US3.3: a paused task still needs setup + remaining work + takedown", () => {
  const { get } = run(
    [
      T("a", {
        status: "PAUSED",
        baseDurationMinutes: 120,
        completedWorkMinutes: 45,
        setupMinutes: 15,
        takedownMinutes: 10,
        interruptionCount: 1,
      }),
      T("b"),
    ],
    [dep("a", "b")]
  );
  assert.equal(get("a").totalPlannedDurationMinutes, 100);
  assert.deepEqual(get("a").earlyFinish, at("09T10:40"));
  assert.deepEqual(get("b").earlyStart, at("09T10:40"));
});

test("001/US4.1: the chain that sets the finish date is critical; the side task has float", () => {
  const { get } = run(
    [T("a", { baseDurationMinutes: 120 }), T("b", { baseDurationMinutes: 120 }), T("side")],
    [dep("a", "b")],
    unleveled
  );
  assert.equal(get("a").isCritical, true);
  assert.equal(get("b").isCritical, true);
  assert.equal(get("side").isCritical, false);
  assert.equal(get("side").totalFloatMinutes, 180);
});

test("001/US4.2: finished tasks are never critical", () => {
  assert.equal(run([T("a", { status: "DONE" })]).get("a").isCritical, false);
});

test("001/US5.1: start-no-earlier-than holds a task back", () => {
  const { get } = run([T("a", { constraintType: "START_NO_EARLIER_THAN", pinnedDate: at("11T09:00") })]);
  assert.deepEqual(get("a").earlyStart, at("11T09:00"));
});

test("001/US5.2: as-late-as-possible sits at its latest start", () => {
  const { get, result } = run(
    [T("a", { baseDurationMinutes: 240 }), T("b", { constraintType: "ALAP" })],
    [],
    unleveled
  );
  assert.deepEqual(get("b").earlyStart, at("09T12:00"));
  assert.deepEqual(result.projectEnd, at("09T13:00"));
});

test("001/US5.3: an impossible must-start-on is reported, not silently honored", () => {
  const { get, result } = run(
    [
      T("a", { baseDurationMinutes: 240 }),
      T("b", { constraintType: "MUST_START_ON", pinnedDate: at("09T10:00") }),
    ],
    [dep("a", "b")]
  );
  assert.deepEqual(get("b").earlyStart, at("09T13:00")); // after its prerequisite
  const c = result.conflicts.find((x) => x.taskId === "b");
  assert.equal(c?.type, "MUST_START_ON_MISSED");
  assert.equal(c?.minutes, 180);
  assert.ok(get("a").totalFloatMinutes >= 0);
});

test("001/US5.3: a missed finish-no-later-than deadline shows as a conflict and negative float", () => {
  const { get, result } = run([
    T("a", { baseDurationMinutes: 240, constraintType: "FINISH_NO_LATER_THAN", pinnedDate: at("09T10:00") }),
  ]);
  assert.equal(result.conflicts[0].type, "DEADLINE_MISSED");
  assert.equal(result.conflicts[0].minutes, 180);
  assert.equal(get("a").totalFloatMinutes, -180);
  assert.equal(get("a").isCritical, true);
});

test("001/edge: an existing cycle is flagged and the rest still schedules", () => {
  const { result, get } = run([T("a"), T("b"), T("c")], [dep("a", "b"), dep("b", "a"), dep("b", "c")]);
  assert.equal(result.hasCycle, true);
  assert.deepEqual([...result.cycleTaskIds].sort(), ["a", "b"]);
  assert.ok(result.conflicts.some((c) => c.type === "DEPENDENCY_CYCLE" && c.taskId === "a"));
  assert.ok(get("c").earlyStart.getTime() >= get("b").earlyFinish.getTime());
});

test("001/edge: unusable calendar settings fall back instead of hanging", () => {
  const broken = { ...base, workingHoursStart: "17:00", workingHoursEnd: "09:00", workDays: [] };
  assert.deepEqual(run([T("a")], [], broken).get("a").earlyFinish, at("09T10:00"));
});

test("001/edge: no tasks", () => {
  const { result } = run([]);
  assert.deepEqual(result.projectEnd, result.projectStart);
  assert.deepEqual(result.tasks, []);
});

/* -------------------------------------------- 002 realistic scheduling */

test("002/US1.1: two independent tasks for one person never overlap; priority goes first", () => {
  const { get, result } = run([T("a", { order: 1 }), T("b", { order: 2, priority: "URGENT" })]);
  assert.deepEqual(get("b").earlyStart, at("09T09:00"));
  assert.deepEqual(get("a").earlyStart, at("09T10:00"));
  assert.deepEqual(result.projectEnd, at("09T11:00"));
});

test("002/US1.2: equal priority falls back to least slack, then board order", () => {
  const { get } = run([
    T("late", { order: 1 }),
    T("urgent", { order: 2, constraintType: "FINISH_NO_LATER_THAN", pinnedDate: at("09T10:00") }),
  ]);
  assert.deepEqual(get("urgent").earlyStart, at("09T09:00"));
  assert.deepEqual(get("late").earlyStart, at("09T10:00"));
  const tie = run([T("second", { order: 2 }), T("first", { order: 1 })]);
  assert.deepEqual(tie.get("first").earlyStart, at("09T09:00"));
});

test("002/US1.3: different assignees can work at the same time", () => {
  const { get } = run([T("a"), T("b", { assignee: "Sam" })]);
  assert.deepEqual(get("a").earlyStart, at("09T09:00"));
  assert.deepEqual(get("b").earlyStart, at("09T09:00"));
});

test("002/US1.4: back-to-back work for one person is all critical; work before a gap is not", () => {
  const packed = run([T("a", { order: 1 }), T("b", { order: 2 })]);
  assert.equal(packed.get("a").isCritical, true);
  assert.equal(packed.get("b").isCritical, true);
  const gap = run([
    T("a"),
    T("b", { constraintType: "START_NO_EARLIER_THAN", pinnedDate: at("10T09:00") }),
  ]);
  assert.equal(gap.get("a").isCritical, false);
  assert.equal(gap.get("a").totalFloatMinutes, 480);
});

test("002/US2.1: other work fits inside a task's unattended time", () => {
  const { get, result } = run([
    T("turkey", { order: 1, baseDurationMinutes: 30, unattendedMinutes: 180, takedownMinutes: 30 }),
    T("potatoes", { order: 2 }),
  ]);
  assert.deepEqual(get("turkey").earlyStart, at("09T09:00"));
  assert.deepEqual(get("turkey").attendedEnd, at("09T09:30"));
  assert.deepEqual(get("turkey").takedownStart, at("09T12:30"));
  assert.deepEqual(get("turkey").earlyFinish, at("09T13:00"));
  assert.deepEqual(get("potatoes").earlyStart, at("09T09:30"));
  assert.deepEqual(result.projectEnd, at("09T13:00"));
});

test("002/US2.2: unattended time runs around the clock", () => {
  const monday4pm = { ...base, projectStartDate: at("09T16:00") };
  const cure = run(
    [T("tile", { unattendedMinutes: 1440 }), T("grout")],
    [dep("tile", "grout")],
    monday4pm,
    at("09T16:00")
  );
  assert.deepEqual(cure.get("tile").attendedEnd, at("09T17:00"));
  assert.deepEqual(cure.get("tile").earlyFinish, at("10T17:00"));
  assert.deepEqual(cure.get("grout").earlyStart, at("11T09:00"));
  const withTakedown = run([T("tile", { unattendedMinutes: 1440, takedownMinutes: 30 })], [], monday4pm, at("09T16:00"));
  assert.deepEqual(withTakedown.get("tile").earlyFinish, at("11T09:30"));
});

test("002/US2.3: work that does not fit inside the wait goes after the takedown", () => {
  const { get } = run([
    T("bread", { order: 1, baseDurationMinutes: 30, unattendedMinutes: 60, takedownMinutes: 15 }),
    T("long", { order: 2, baseDurationMinutes: 120 }),
  ]);
  // bread 09:00-09:30, out of the oven 10:30-10:45; a 2h task cannot fit in the 1h wait
  assert.deepEqual(get("bread").earlyFinish, at("09T10:45"));
  assert.deepEqual(get("long").earlyStart, at("09T10:45"));
});

test("002/US2.4: takedown waits if the person is committed elsewhere when the wait ends", () => {
  const { get } = run([
    T("bread", { order: 1, baseDurationMinutes: 30, unattendedMinutes: 60, takedownMinutes: 15 }),
    T("call", {
      order: 2,
      baseDurationMinutes: 90,
      constraintType: "MUST_START_ON",
      pinnedDate: at("09T10:00"),
    }),
  ]);
  assert.deepEqual(get("call").earlyStart, at("09T10:00"));
  assert.deepEqual(get("bread").takedownStart, at("09T11:30"));
  assert.deepEqual(get("bread").earlyFinish, at("09T11:45"));
});

test("002/US3.1: unstarted work is never planned before now", () => {
  const wednesday = at("11T10:00");
  assert.deepEqual(run([T("a")], [], base, wednesday).get("a").earlyStart, wednesday);
  const saturday = at("14T12:00");
  assert.deepEqual(run([T("a")], [], base, saturday).get("a").earlyStart, at("16T09:00"));
});

test("002/US3.2: finished work stays where it happened", () => {
  const wednesday = at("11T10:00");
  const { get, result } = run(
    [T("a", { status: "DONE", actualStart: MON9, actualEnd: at("09T10:00") }), T("b")],
    [dep("a", "b")],
    base,
    wednesday
  );
  assert.deepEqual(get("a").earlyStart, MON9);
  assert.deepEqual(get("a").earlyFinish, at("09T10:00"));
  assert.deepEqual(get("b").earlyStart, wednesday);
  assert.deepEqual(result.projectStart, MON9);
});

test("002/US3.3: running work continues from now with only what is left", () => {
  const now = at("11T10:00");
  const { get } = run(
    [
      T("a", {
        status: "IN_PROGRESS",
        baseDurationMinutes: 120,
        takedownMinutes: 10,
        completedWorkMinutes: 30,
        actualStart: MON9,
        openWorkSessionStart: at("11T09:30"),
      }),
      T("b"),
      T("c", { priority: "URGENT" }),
    ],
    [dep("a", "b")],
    base,
    now
  );
  assert.equal(get("a").netWorkRemainingMinutes, 60);
  assert.deepEqual(get("a").earlyStart, MON9);
  assert.deepEqual(get("a").earlyFinish, at("11T11:10"));
  // even urgent work waits for what is already under way
  assert.deepEqual(get("c").earlyStart, at("11T11:10"));
  assert.deepEqual(get("b").earlyStart, at("11T12:10"));
});

test("002/US3.4: two running tasks for one person are flagged", () => {
  const running = { status: "IN_PROGRESS" as const, openWorkSessionStart: MON9 };
  const { result } = run([T("a", running), T("b", running)]);
  assert.ok(result.conflicts.some((c) => c.type === "MULTIPLE_ACTIVE"));
});

test("002/US4.1: a pinned start keeps its slot and other work flows around it", () => {
  const { get, result } = run([
    T("big", { order: 1, baseDurationMinutes: 480 }),
    T("small", { order: 2 }),
    T("meeting", { order: 3, constraintType: "MUST_START_ON", pinnedDate: at("10T09:00") }),
  ]);
  assert.deepEqual(get("meeting").earlyStart, at("10T09:00"));
  assert.deepEqual(get("big").earlyStart, at("09T09:00"));
  assert.deepEqual(get("small").earlyStart, at("10T10:00"));
  assert.deepEqual(result.conflicts, []);
});

test("002/US4.2: must-finish-on is scheduled to end on its date", () => {
  const { get } = run([T("a", { constraintType: "MUST_FINISH_ON", pinnedDate: at("10T12:00") })]);
  assert.deepEqual(get("a").earlyFinish, at("10T12:00"));
  assert.deepEqual(get("a").earlyStart, at("10T11:00"));
});

/* ------------------------------------------------ 003 calendar */

test("003/US2.1: time off is skipped", () => {
  const busy = [{ start: at("09T10:00"), end: at("09T12:00") }];
  const { get } = run([T("a", { baseDurationMinutes: 120 })], [], { ...base, busy });
  assert.deepEqual(get("a").earlyFinish, at("09T13:00"));
  const dayOff = [{ start: at("10T00:00"), end: at("11T00:00") }];
  const long = run([T("a", { baseDurationMinutes: 540 })], [], { ...base, busy: dayOff });
  assert.deepEqual(long.get("a").earlyFinish, at("11T10:00"));
});

test("003/US1.2: working hours are in the configured time zone, across DST", () => {
  const chicago = { ...base, timezone: "America/Chicago", projectStartDate: null };
  // 12:00Z is 06:00 CST; the day starts at 09:00 CST = 15:00Z
  assert.deepEqual(run([T("a")], [], chicago, at("09T12:00")).get("a").earlyStart, at("09T15:00"));
  // In July Chicago is on CDT: 09:00 = 14:00Z
  const july = new Date("2026-07-06T03:00:00Z");
  assert.deepEqual(
    run([T("a")], [], chicago, july).get("a").earlyStart,
    new Date("2026-07-06T14:00:00Z")
  );
});

/* ------------------------------------------------ success criteria */

test("001/SC-002: 200 tasks schedule in under a second", () => {
  const tasks: SchedulerTask[] = [];
  const deps: SchedulerDependency[] = [];
  for (let i = 0; i < 200; i++) {
    tasks.push(T(`t${i}`, { order: i, setupMinutes: 10, takedownMinutes: 10, unattendedMinutes: i % 7 === 0 ? 90 : 0 }));
    if (i > 0 && i % 3 !== 0) deps.push(dep(`t${i - 1}`, `t${i}`));
    if (i > 10 && i % 5 === 0) deps.push(dep(`t${i - 10}`, `t${i}`, "SS", 15));
  }
  const started = performance.now();
  const { result } = run(tasks, deps);
  const ms = performance.now() - started;
  assert.equal(result.tasks.length, 200);
  assert.ok(ms < 1000, `took ${ms.toFixed(0)}ms`);
});

test("leveled plans never double-book a person", () => {
  const tasks: SchedulerTask[] = [];
  const deps: SchedulerDependency[] = [];
  for (let i = 0; i < 40; i++) {
    tasks.push(
      T(`t${i}`, {
        order: i,
        baseDurationMinutes: 30 + ((i * 37) % 200),
        setupMinutes: (i * 7) % 20,
        takedownMinutes: (i * 5) % 15,
        unattendedMinutes: i % 4 === 0 ? 60 + i * 10 : 0,
        priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const)[i % 4],
      })
    );
    if (i % 3 === 1) deps.push(dep(`t${i - 1}`, `t${i}`));
  }
  const { result } = run(tasks, deps);
  const stretches = result.tasks.flatMap((t) =>
    t.unattendedMinutesApplied > 0
      ? [
          [t.earlyStart, t.attendedEnd],
          [t.takedownStart, t.earlyFinish],
        ]
      : [[t.earlyStart, t.earlyFinish]]
  ).filter(([from, to]) => to > from);
  for (let i = 0; i < stretches.length; i++) {
    for (let j = i + 1; j < stretches.length; j++) {
      const [a0, a1] = stretches[i];
      const [b0, b1] = stretches[j];
      assert.ok(a1 <= b0 || b1 <= a0, `overlap between stretch ${i} and ${j}`);
    }
  }
  for (const d of deps) {
    const map = new Map(result.tasks.map((t) => [t.id, t]));
    assert.ok(map.get(d.successorId)!.earlyStart >= map.get(d.predecessorId)!.earlyFinish);
  }
});
