import { test } from "node:test";
import assert from "node:assert/strict";
import { compareToBaseline } from "../src/lib/baseline";
import { backupSchema, importRequestSchema } from "../src/lib/validation";
import { checkBackup } from "../src/lib/backup-check";
import { ApiError } from "../src/lib/errors";

const at = (s: string) => new Date(`2026-11-${s}:00Z`);
const settings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  workDays: [1, 2, 3, 4, 5],
  timezone: "UTC",
};

test("006/US1: slip is measured in working minutes per task and for the finish date", () => {
  const entries = [
    { taskId: "a", title: "A", plannedStart: at("09T09:00"), plannedEnd: at("09T10:00") },
    { taskId: "b", title: "B", plannedStart: at("09T10:00"), plannedEnd: at("09T16:00") },
    { taskId: "c", title: "C", plannedStart: at("09T16:00"), plannedEnd: at("09T17:00") },
    { taskId: "gone", title: "Gone", plannedStart: at("09T09:00"), plannedEnd: at("09T10:00") },
  ];
  const current = [
    { id: "a", title: "A", earlyStart: at("09T09:00"), earlyFinish: at("09T10:00") },
    { id: "b", title: "B renamed", earlyStart: at("09T10:00"), earlyFinish: at("10T10:00") }, // overnight: +2h working
    { id: "c", title: "C", earlyStart: at("09T15:00"), earlyFinish: at("09T16:00") },
    { id: "new", title: "New", earlyStart: at("10T10:00"), earlyFinish: at("10T11:00") },
  ];
  const r = compareToBaseline(entries, at("09T17:00"), current, at("10T11:00"), settings);
  const state = Object.fromEntries(r.tasks.map((t) => [t.taskId, [t.state, t.slipMinutes]]));
  assert.deepEqual(state, {
    a: ["ON_PLAN", 0],
    b: ["SLIPPED", 120],
    c: ["AHEAD", -60],
    gone: ["REMOVED", 0],
    new: ["ADDED", 0],
  });
  assert.equal(r.tasks.find((t) => t.taskId === "b")!.title, "B renamed");
  assert.equal(r.projectSlipMinutes, 120);
  assert.equal(r.slippedCount, 1);
});

const task = (id: string) => ({
  id,
  title: id,
  status: "SCHEDULED",
  priority: "MEDIUM",
  baseDurationMinutes: 60,
  setupMinutes: 15,
  takedownMinutes: 10,
  constraintType: "ASAP",
  color: "#3b82f6",
  order: 1,
  createdAt: "2026-11-09T09:00:00.000Z",
  pinnedDate: null,
});
const backup = (over: Record<string, unknown> = {}) => ({
  version: 1,
  tasks: [task("a"), task("b")],
  dependencies: [{ id: "d", predecessorId: "a", successorId: "b", type: "FS", lagMinutes: 0 }],
  workSessions: [],
  interruptionLogs: [],
  ...over,
});

test("006/US2: a backup round-trips through the schema with dates restored", () => {
  const parsed = backupSchema.parse(JSON.parse(JSON.stringify(backup())));
  assert.ok(parsed.tasks[0].createdAt instanceof Date);
  assert.equal(parsed.tasks[0].unattendedMinutes, 0); // older backups get the default
  assert.deepEqual(parsed.timeOff, []);
  checkBackup(parsed);
});

test("006/US2: restore needs the typed confirmation and a consistent file", () => {
  assert.equal(importRequestSchema.safeParse({ data: backup() }).success, false);
  assert.equal(importRequestSchema.safeParse({ confirm: "REPLACE_ALL", data: backup() }).success, true);
  assert.equal(backupSchema.safeParse(backup({ version: 2 })).success, false);
  assert.equal(backupSchema.safeParse(backup({ tasks: [{ ...task("a"), status: "NOPE" }] })).success, false);

  const bad = (b: Record<string, unknown>) => () => checkBackup(backupSchema.parse(b));
  const is400 = (e: unknown) => e instanceof ApiError && e.status === 400;
  assert.throws(bad(backup({ tasks: [task("a"), task("a")], dependencies: [] })), is400);
  assert.throws(
    bad(backup({ dependencies: [{ id: "d", predecessorId: "a", successorId: "zzz", type: "FS", lagMinutes: 0 }] })),
    is400
  );
  assert.throws(
    bad(
      backup({
        dependencies: [
          { id: "d1", predecessorId: "a", successorId: "b", type: "FS", lagMinutes: 0 },
          { id: "d2", predecessorId: "b", successorId: "a", type: "FS", lagMinutes: 0 },
        ],
      })
    ),
    is400
  );
});
