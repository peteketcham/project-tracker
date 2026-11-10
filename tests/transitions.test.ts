import { test } from "node:test";
import assert from "node:assert/strict";
import { planTransition, type TransitionTask } from "../src/lib/tasks/transitions";
import { ApiError } from "../src/lib/errors";

const now = new Date("2026-11-09T15:00:00Z");
const at = (iso: string) => new Date(iso);
const task = (over: Partial<TransitionTask> = {}): TransitionTask => ({
  id: "t1",
  title: "Tile the shower",
  status: "SCHEDULED",
  setupMinutes: 15,
  takedownMinutes: 10,
  actualStart: null,
  ...over,
});

test("START opens a setup session followed by an open work session", () => {
  const plan = planTransition(task(), [], "START", { now });
  assert.equal(plan.taskUpdate.status, "IN_PROGRESS");
  assert.deepEqual(plan.taskUpdate.actualStart, now);
  assert.equal(plan.createSessions.length, 2);
  const [setup, work] = plan.createSessions;
  assert.equal(setup.sessionType, "SETUP");
  assert.equal(setup.durationMinutes, 15);
  assert.equal(work.sessionType, "WORK");
  assert.deepEqual(work.startTime, at("2026-11-09T15:15:00Z"));
  assert.equal(work.endTime, null);
});

test("a second START on a running task is refused", () => {
  assert.throws(
    () => planTransition(task({ status: "IN_PROGRESS" }), [], "START", { now }),
    (e: unknown) => e instanceof ApiError && e.status === 409
  );
});

test("PAUSE closes the work session, adds takedown and logs S+T overhead", () => {
  const open = [{ id: "w1", sessionType: "WORK", startTime: at("2026-11-09T14:00:00Z") }];
  const plan = planTransition(task({ status: "IN_PROGRESS" }), open, "PAUSE", {
    now,
    reason: "  school called ",
  });
  assert.deepEqual(plan.closeSessions, [{ id: "w1", endTime: now, durationMinutes: 60 }]);
  assert.equal(plan.createSessions[0].sessionType, "TAKEDOWN");
  assert.equal(plan.createSessions[0].durationMinutes, 10);
  assert.equal(plan.createInterruption?.overheadAddedMinutes, 25);
  assert.equal(plan.createInterruption?.reason, "school called");
  assert.equal(plan.taskUpdate.status, "PAUSED");
});

test("pausing during setup counts zero focused work", () => {
  const open = [{ id: "w1", sessionType: "WORK", startTime: at("2026-11-09T15:10:00Z") }];
  const plan = planTransition(task({ status: "IN_PROGRESS" }), open, "PAUSE", { now });
  assert.equal(plan.closeSessions[0].durationMinutes, 0);
});

test("only running tasks can be paused", () => {
  for (const status of ["BACKLOG", "SCHEDULED", "PAUSED", "DONE"] as const) {
    assert.throws(() => planTransition(task({ status }), [], "PAUSE", { now }), ApiError);
  }
});

test("RESUME adds setup again, keeps the original start and resolves the interruption", () => {
  const started = at("2026-11-09T09:00:00Z");
  const plan = planTransition(task({ status: "PAUSED", actualStart: started }), [], "RESUME", { now });
  assert.equal(plan.taskUpdate.status, "IN_PROGRESS");
  assert.deepEqual(plan.taskUpdate.actualStart, started);
  assert.deepEqual(plan.resolveInterruptionAt, now);
  assert.equal(plan.createSessions[0].sessionType, "SETUP");
  assert.throws(() => planTransition(task(), [], "RESUME", { now }), ApiError);
});

test("dragging a paused task to In Progress (START) behaves as a resume", () => {
  const plan = planTransition(task({ status: "PAUSED" }), [], "START", { now });
  assert.deepEqual(plan.resolveInterruptionAt, now);
});

test("COMPLETE from running closes the session and ends after takedown", () => {
  const open = [{ id: "w1", sessionType: "WORK", startTime: at("2026-11-09T14:30:00Z") }];
  const plan = planTransition(task({ status: "IN_PROGRESS" }), open, "COMPLETE", { now });
  assert.equal(plan.closeSessions[0].durationMinutes, 30);
  assert.equal(plan.createSessions[0].sessionType, "TAKEDOWN");
  assert.equal(plan.taskUpdate.status, "DONE");
  assert.deepEqual(plan.taskUpdate.actualEnd, at("2026-11-09T15:10:00Z"));
});

test("COMPLETE without tracking stamps start and end; completing twice is refused", () => {
  const plan = planTransition(task(), [], "COMPLETE", { now });
  assert.deepEqual(plan.taskUpdate, { status: "DONE", actualStart: now, actualEnd: now });
  assert.throws(() => planTransition(task({ status: "DONE" }), [], "COMPLETE", { now }), ApiError);
});

test("a running task cannot be dragged straight to Backlog or Scheduled", () => {
  assert.throws(
    () => planTransition(task({ status: "IN_PROGRESS" }), [], "MOVE_BACKLOG", { now }),
    /Pause or complete it first/
  );
});

test("reopening a done task clears its completion time", () => {
  const plan = planTransition(task({ status: "DONE" }), [], "MOVE_SCHEDULED", { now });
  assert.deepEqual(plan.taskUpdate, { status: "SCHEDULED", actualEnd: null });
});
