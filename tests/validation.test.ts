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
