import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dependencySchema,
  planSchema,
  sessionActionSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from "../src/lib/validation";

test("task create applies defaults", () => {
  const t = taskCreateSchema.parse({ title: "Paint fence" });
  assert.equal(t.status, "SCHEDULED");
  assert.equal(t.priority, "MEDIUM");
  assert.equal(t.baseDurationMinutes, 60);
  assert.equal(t.setupMinutes, 15);
  assert.equal(t.takedownMinutes, 10);
  assert.equal(t.constraintType, "ASAP");
});

test("task create rejects unknown status, negative minutes and bad dates", () => {
  assert.equal(taskCreateSchema.safeParse({ title: "x", status: "BOGUS" }).success, false);
  assert.equal(taskCreateSchema.safeParse({ title: "x", setupMinutes: -5 }).success, false);
  assert.equal(taskCreateSchema.safeParse({ title: "x", baseDurationMinutes: 0 }).success, false);
  assert.equal(taskCreateSchema.safeParse({ title: "x", baseDurationMinutes: "abc" }).success, false);
  assert.equal(taskCreateSchema.safeParse({ title: "x", color: "red" }).success, false);
  assert.equal(
    taskCreateSchema.safeParse({
      title: "x",
      constraintType: "MUST_START_ON",
      pinnedDate: "not a date",
    }).success,
    false
  );
});

test("new tasks cannot be created directly in a tracked state", () => {
  for (const status of ["IN_PROGRESS", "PAUSED", "DONE"]) {
    assert.equal(taskCreateSchema.safeParse({ title: "x", status }).success, false, status);
  }
});

test("dated constraints need a date", () => {
  assert.equal(
    taskCreateSchema.safeParse({ title: "x", constraintType: "MUST_FINISH_ON" }).success,
    false
  );
  assert.equal(
    taskUpdateSchema.safeParse({ constraintType: "MUST_FINISH_ON", pinnedDate: null }).success,
    false
  );
  const ok = taskCreateSchema.parse({
    title: "x",
    constraintType: "MUST_FINISH_ON",
    pinnedDate: "2026-11-12T17:00:00Z",
  });
  assert.ok(ok.pinnedDate instanceof Date);
});

test("an empty pinned date clears it", () => {
  assert.equal(taskUpdateSchema.parse({ pinnedDate: "" }).pinnedDate, null);
  assert.equal(taskUpdateSchema.parse({ pinnedDate: null }).pinnedDate, null);
});

test("dependencies refuse self-links and unknown types", () => {
  assert.equal(dependencySchema.safeParse({ predecessorId: "a", successorId: "a" }).success, false);
  assert.equal(
    dependencySchema.safeParse({ predecessorId: "a", successorId: "b", type: "XX" }).success,
    false
  );
  const d = dependencySchema.parse({ predecessorId: "a", successorId: "b", lagMinutes: "-30" });
  assert.equal(d.type, "FS");
  assert.equal(d.lagMinutes, -30);
});

test("session actions are a closed set", () => {
  assert.equal(sessionActionSchema.safeParse({ taskId: "a", action: "DELETE" }).success, false);
  assert.equal(sessionActionSchema.safeParse({ taskId: "", action: "START" }).success, false);
});

test("a plan with an unknown or duplicate key is rejected as a whole", () => {
  const base = { title: "x" };
  assert.equal(
    planSchema.safeParse({
      tasks: [{ tempKey: "A", ...base }],
      dependencies: [{ predecessorKey: "A", successorKey: "Z" }],
    }).success,
    false
  );
  assert.equal(
    planSchema.safeParse({ tasks: [{ tempKey: "A", ...base }, { tempKey: "A", ...base }] }).success,
    false
  );
  assert.equal(
    planSchema.safeParse({
      tasks: [{ tempKey: "A", ...base }, { tempKey: "B", ...base }],
      dependencies: [{ predecessorKey: "A", successorKey: "B" }],
    }).success,
    true
  );
});

import { icsImportSchema, settingsUpdateSchema, timeOffSchema } from "../src/lib/validation";

test("003/US1.1: settings refuse hours that end before they start, no working days, unknown zones", () => {
  const good = { workingHoursStart: "08:00", workingHoursEnd: "18:00", workDays: [1, 2, 3] };
  assert.equal(settingsUpdateSchema.safeParse(good).success, true);
  assert.equal(
    settingsUpdateSchema.safeParse({ ...good, workingHoursStart: "18:00", workingHoursEnd: "08:00" }).success,
    false
  );
  assert.equal(settingsUpdateSchema.safeParse({ ...good, workDays: [] }).success, false);
  assert.equal(settingsUpdateSchema.safeParse({ ...good, workDays: [7] }).success, false);
  assert.equal(settingsUpdateSchema.safeParse({ ...good, timezone: "Mars/Olympus" }).success, false);
  assert.equal(settingsUpdateSchema.parse({ ...good, timezone: "America/Chicago" }).timezone, "America/Chicago");
  assert.equal(settingsUpdateSchema.parse({ ...good, timezone: "" }).timezone, null);
  assert.deepEqual(settingsUpdateSchema.parse({ ...good, workDays: [3, 1, 3] }).workDays, [1, 3]);
});

test("003/US2: time off must end after it starts", () => {
  assert.equal(
    timeOffSchema.safeParse({ title: "Trip", start: "2026-11-20T09:00:00Z", end: "2026-11-19T09:00:00Z" }).success,
    false
  );
  assert.equal(
    timeOffSchema.safeParse({ title: "Trip", start: "2026-11-20T09:00:00Z", end: "2026-11-21T09:00:00Z" }).success,
    true
  );
});

test("003/US3: an import names exactly one source", () => {
  assert.equal(icsImportSchema.safeParse({}).success, false);
  assert.equal(icsImportSchema.safeParse({ ics: "x", url: "https://a/b.ics" }).success, false);
  assert.equal(icsImportSchema.safeParse({ useConfigured: true }).success, true);
});
