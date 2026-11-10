import type {
  ScheduleCalculationResult,
  ScheduleConflict,
  ScheduledTaskResult,
  SchedulerDependency,
  SchedulerTask,
  WorkingCalendarSettings,
} from "./types";
import { WorkCalendar, type Interval } from "./calendar";
import { findCycleNodes, wouldCreateCycle } from "../tasks/graph";

/**
 * The scheduler. Pure: same inputs (including `now`) always give the same plan.
 *
 * 1. Forward pass (CPM) gives early dates; a backward pass gives late dates.
 * 2. ALAP tasks are pushed to their late start.
 * 3. A second forward pass places tasks one by one in priority order so that no
 *    assignee has two attended stretches at once (resource leveling). Finished
 *    work stays at its actual dates, running work continues from `now`, and
 *    nothing unstarted is planned before `now`.
 * 4. A final backward pass, which also follows back-to-back work of the same
 *    assignee, gives float and the critical set.
 */

const MIN = 60_000;
export const CRITICAL_FLOAT_THRESHOLD_MINUTES = 15;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const DEFAULT_ASSIGNEE = "\u0000me";

interface Shape {
  setup: number;
  work: number;
  wait: number;
  takedown: number;
}

interface Placement {
  start: Date;
  attendedEnd: Date;
  takedownStart: Date;
  finish: Date;
}

interface Late {
  lateStart: Date;
  lateFinish: Date;
}

interface Edge {
  predecessorId: string;
  successorId: string;
  type: SchedulerDependency["type"] | "RESOURCE";
  lagMinutes: number;
}

const toDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const later = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);
const earlier = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);
const nonNegative = (n: number | undefined) => Math.max(0, Math.round(n ?? 0));

export function calculateSchedule(
  tasks: SchedulerTask[],
  dependencies: SchedulerDependency[],
  settings: WorkingCalendarSettings,
  now: Date
): ScheduleCalculationResult {
  const cal = new WorkCalendar(settings);
  const level = settings.levelResources !== false;
  const projectStartSetting = toDate(settings.projectStartDate);
  /** Earliest moment unstarted work may be planned. */
  const floor = cal.snapForward(projectStartSetting ? later(projectStartSetting, now) : now);

  if (tasks.length === 0) {
    return {
      tasks: [],
      projectStart: floor,
      projectEnd: floor,
      criticalPathTaskIds: [],
      hasCycle: false,
      cycleTaskIds: [],
      conflicts: [],
    };
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const conflicts = new Map<string, ScheduleConflict[]>(tasks.map((t) => [t.id, []]));
  const addConflict = (c: ScheduleConflict) => {
    const list = conflicts.get(c.taskId)!;
    if (!list.some((x) => x.type === c.type)) list.push(c);
  };

  /* ---------------------------------------------------------------- graph */

  const known = dependencies.filter(
    (d) =>
      byId.has(d.predecessorId) && byId.has(d.successorId) && d.predecessorId !== d.successorId
  );
  const cycleTaskIds = findCycleNodes([...byId.keys()], known);
  const inCycle = new Set(cycleTaskIds);
  for (const id of cycleTaskIds) {
    addConflict({
      taskId: id,
      type: "DEPENDENCY_CYCLE",
      message: `"${byId.get(id)!.title}" is part of a dependency cycle; its cyclic links are ignored.`,
    });
  }
  // Links between two cycle members are dropped so the rest of the plan still schedules.
  const edges: Edge[] = known.filter(
    (d) => !(inCycle.has(d.predecessorId) && inCycle.has(d.successorId))
  );
  const incoming = new Map<string, Edge[]>(tasks.map((t) => [t.id, []]));
  const outgoing = new Map<string, Edge[]>(tasks.map((t) => [t.id, []]));
  for (const e of edges) {
    incoming.get(e.successorId)!.push(e);
    outgoing.get(e.predecessorId)!.push(e);
  }

  /* --------------------------------------------------------------- shapes */

  const shapes = new Map<string, Shape>();
  for (const t of tasks) {
    const S = nonNegative(t.setupMinutes);
    const T = nonNegative(t.takedownMinutes);
    const U = nonNegative(t.unattendedMinutes);
    const done = nonNegative(t.completedWorkMinutes);
    if (t.status === "DONE") {
      shapes.set(t.id, { setup: 0, work: 0, wait: 0, takedown: 0 });
    } else if (t.status === "IN_PROGRESS") {
      const open = toDate(t.openWorkSessionStart);
      const sinceOpen = open ? (now.getTime() - open.getTime()) / MIN : 0;
      shapes.set(t.id, {
        setup: sinceOpen < 0 ? Math.ceil(-sinceOpen) : 0, // still warming up
        work: Math.max(0, nonNegative(t.baseDurationMinutes) - done - Math.max(0, Math.floor(sinceOpen))),
        wait: U,
        takedown: T,
      });
    } else {
      // Not started, or paused: getting (back) into it costs a full setup.
      shapes.set(t.id, {
        setup: S,
        work: Math.max(0, nonNegative(t.baseDurationMinutes) - done),
        wait: U,
        takedown: T,
      });
    }
  }

  /** Where a task ends up if it starts at `start`, ignoring other tasks. */
  const timeline = (id: string, start: Date): Placement => {
    const s = shapes.get(id)!;
    const attendedEnd = cal.add(start, s.setup + s.work);
    if (s.wait === 0) {
      return {
        start,
        attendedEnd,
        takedownStart: attendedEnd,
        finish: cal.add(start, s.setup + s.work + s.takedown),
      };
    }
    const waitEnd = new Date(attendedEnd.getTime() + s.wait * MIN);
    const takedownStart = s.takedown > 0 ? cal.snapForward(waitEnd) : waitEnd;
    return { start, attendedEnd, takedownStart, finish: cal.add(takedownStart, s.takedown) };
  };

  /** Latest start that still finishes by `finish`. */
  const startForFinish = (id: string, finish: Date): Date => {
    const s = shapes.get(id)!;
    if (s.wait === 0) return cal.subtract(finish, s.setup + s.work + s.takedown);
    const takedownStart = cal.subtract(finish, s.takedown);
    const attendedEnd = new Date(takedownStart.getTime() - s.wait * MIN);
    return cal.subtract(attendedEnd, s.setup + s.work);
  };

  const attendedMinutes = (id: string) => {
    const s = shapes.get(id)!;
    return s.setup + s.work + s.takedown;
  };
  const snapStart = (id: string, d: Date) => (attendedMinutes(id) > 0 ? cal.snapForward(d) : d);

  /* -------------------------------------------------------- forward pass */

  const overlapping = (busy: Interval[], from: number, to: number) =>
    busy.find((b) => b.start < to && b.end > from);

  function forward(
    extraLowerBound: Map<string, Date>,
    leveled: boolean,
    rank: (id: string) => [deadline: number, slack: number]
  ): Map<string, Placement> {
    const placed = new Map<string, Placement>();
    const busyByAssignee = new Map<string, Interval[]>();
    const busyFor = (t: SchedulerTask) => {
      const key = t.assignee?.trim() || DEFAULT_ASSIGNEE;
      if (!busyByAssignee.has(key)) busyByAssignee.set(key, []);
      return busyByAssignee.get(key)!;
    };
    const occupy = (t: SchedulerTask, p: Placement) => {
      const s = shapes.get(t.id)!;
      const busy = busyFor(t);
      const first = s.wait > 0 ? p.attendedEnd : p.finish;
      if (first.getTime() > p.start.getTime()) {
        busy.push({ start: p.start.getTime(), end: first.getTime() });
      }
      if (s.wait > 0 && p.finish.getTime() > p.takedownStart.getTime()) {
        busy.push({ start: p.takedownStart.getTime(), end: p.finish.getTime() });
      }
    };

    const pending = new Map<string, number>(tasks.map((t) => [t.id, incoming.get(t.id)!.length]));
    const ready = tasks.filter((t) => pending.get(t.id) === 0).map((t) => t.id);
    const statusRank = (t: SchedulerTask) =>
      t.status === "DONE" ? 0 : t.status === "IN_PROGRESS" ? 1 : 2;
    const hardPin = (t: SchedulerTask) =>
      (t.constraintType === "MUST_START_ON" || t.constraintType === "MUST_FINISH_ON") &&
      toDate(t.pinnedDate)
        ? 0
        : 1;

    while (ready.length > 0) {
      // Pick the next task: facts first, then pinned work, then priority, then
      // whatever a deadline makes urgent, then tasks with unattended time (start
      // the oven first so other work can fill the wait), then least slack, then
      // board order.
      ready.sort((a, b) => {
        const ta = byId.get(a)!;
        const tb = byId.get(b)!;
        const [deadlineA, slackA] = rank(a);
        const [deadlineB, slackB] = rank(b);
        return (
          statusRank(ta) - statusRank(tb) ||
          hardPin(ta) - hardPin(tb) ||
          (PRIORITY_RANK[ta.priority] ?? 2) - (PRIORITY_RANK[tb.priority] ?? 2) ||
          (deadlineA === deadlineB ? 0 : deadlineA < deadlineB ? -1 : 1) ||
          (shapes.get(b)!.wait > 0 ? 1 : 0) - (shapes.get(a)!.wait > 0 ? 1 : 0) ||
          slackA - slackB ||
          (ta.order ?? 0) - (tb.order ?? 0)
        );
      });
      const id = ready.shift()!;
      const task = byId.get(id)!;
      placed.set(id, place(task));
      for (const e of outgoing.get(id)!) {
        const left = pending.get(e.successorId)! - 1;
        pending.set(e.successorId, left);
        if (left === 0) ready.push(e.successorId);
      }
    }
    return placed;

    function place(task: SchedulerTask): Placement {
      const id = task.id;
      const shape = shapes.get(id)!;

      if (task.status === "DONE") {
        const end = toDate(task.actualEnd) ?? toDate(task.actualStart) ?? earlier(now, floor);
        const start = earlier(toDate(task.actualStart) ?? end, end);
        return { start, attendedEnd: end, takedownStart: end, finish: end };
      }

      if (task.status === "IN_PROGRESS") {
        // Already running: it continues from now, whatever the plan said.
        const p = timeline(id, now);
        const busy = busyFor(task);
        const firstEnd = shape.wait > 0 ? p.attendedEnd : p.finish;
        if (leveled && overlapping(busy, now.getTime(), firstEnd.getTime())) {
          addConflict({
            taskId: id,
            type: "MULTIPLE_ACTIVE",
            message: `"${task.title}" is in progress at the same time as another task for the same person.`,
          });
        }
        occupy(task, p);
        return { ...p, start: toDate(task.actualStart) ?? now };
      }

      // Lower bound from "not before now", predecessors and constraints.
      let bound = floor;
      for (const e of incoming.get(id)!) {
        const pred = placed.get(e.predecessorId);
        if (!pred) continue;
        let b: Date;
        if (e.type === "SS") b = cal.shift(pred.start, e.lagMinutes);
        else if (e.type === "FF") b = startForFinish(id, cal.shift(pred.finish, e.lagMinutes));
        else if (e.type === "SF") b = startForFinish(id, cal.shift(pred.start, e.lagMinutes));
        else b = cal.shift(pred.finish, e.lagMinutes);
        bound = later(bound, b);
      }
      const pinned = toDate(task.pinnedDate);
      if (pinned) {
        if (task.constraintType === "START_NO_EARLIER_THAN" || task.constraintType === "MUST_START_ON") {
          bound = later(bound, pinned);
        } else if (task.constraintType === "MUST_FINISH_ON") {
          bound = later(bound, startForFinish(id, cal.snapBackward(pinned)));
        }
      }
      const extra = extraLowerBound.get(id);
      if (extra) bound = later(bound, extra);

      let p = timeline(id, snapStart(id, bound));
      if (leveled && attendedMinutes(id) > 0) {
        const busy = busyFor(task);
        for (let guard = 0; guard < 10_000; guard++) {
          const firstEnd = shape.wait > 0 ? p.attendedEnd : p.finish;
          const hit = overlapping(busy, p.start.getTime(), firstEnd.getTime());
          if (!hit) break;
          p = timeline(id, snapStart(id, new Date(hit.end)));
        }
        if (shape.wait > 0 && shape.takedown > 0) {
          // The thing can wait a little longer; takedown takes the next free slot.
          for (let guard = 0; guard < 10_000; guard++) {
            const hit = overlapping(busy, p.takedownStart.getTime(), p.finish.getTime());
            if (!hit) break;
            const takedownStart = cal.snapForward(new Date(hit.end));
            p = { ...p, takedownStart, finish: cal.add(takedownStart, shape.takedown) };
          }
        }
        occupy(task, p);
      }
      return p;
    }
  }

  /* ------------------------------------------------------- backward pass */

  function backward(placed: Map<string, Placement>, projectEnd: Date, extraEdges: Edge[]) {
    const all = [...edges, ...extraEdges];
    const out = new Map<string, Edge[]>(tasks.map((t) => [t.id, []]));
    const pending = new Map<string, number>(tasks.map((t) => [t.id, 0]));
    for (const e of all) {
      out.get(e.predecessorId)!.push(e);
      pending.set(e.successorId, pending.get(e.successorId)! + 1);
    }
    const order: string[] = [];
    const queue = tasks.filter((t) => pending.get(t.id) === 0).map((t) => t.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const e of out.get(id)!) {
        const left = pending.get(e.successorId)! - 1;
        pending.set(e.successorId, left);
        if (left === 0) queue.push(e.successorId);
      }
    }

    const late = new Map<string, Late>();
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const task = byId.get(id)!;
      const p = placed.get(id)!;
      if (task.status === "DONE") {
        late.set(id, { lateStart: p.start, lateFinish: p.finish });
        continue;
      }

      let lateFinish = projectEnd;
      const pinned = toDate(task.pinnedDate);
      if (
        pinned &&
        (task.constraintType === "FINISH_NO_LATER_THAN" || task.constraintType === "MUST_FINISH_ON")
      ) {
        lateFinish = earlier(lateFinish, cal.snapBackward(pinned));
      }
      for (const e of out.get(id)!) {
        const succ = late.get(e.successorId);
        if (!succ || byId.get(e.successorId)!.status === "DONE") continue;
        let limit: Date;
        if (e.type === "RESOURCE") {
          // The successor needs this person as soon as this task lets go of them.
          const s = shapes.get(id)!;
          if (s.wait === 0) limit = succ.lateStart;
          else {
            const waitEnd = new Date(succ.lateStart.getTime() + s.wait * MIN);
            limit = cal.add(s.takedown > 0 ? cal.snapForward(waitEnd) : waitEnd, s.takedown);
          }
        } else if (e.type === "FF") limit = cal.shift(succ.lateFinish, -e.lagMinutes);
        else if (e.type === "SS") limit = timeline(id, cal.shift(succ.lateStart, -e.lagMinutes)).finish;
        else if (e.type === "SF") limit = timeline(id, cal.shift(succ.lateFinish, -e.lagMinutes)).finish;
        else limit = cal.shift(succ.lateStart, -e.lagMinutes);
        lateFinish = earlier(lateFinish, limit);
      }
      late.set(id, { lateStart: startForFinish(id, lateFinish), lateFinish });
    }
    return late;
  }

  const endOf = (placed: Map<string, Placement>) => {
    let end: Date | null = null;
    for (const p of placed.values()) end = end ? later(end, p.finish) : p.finish;
    return end ?? floor;
  };

  /* ----------------------------------------------------------------- run */

  // Pass 1: plain CPM, to learn each task's urgency and where ALAP tasks belong.
  const cpm = forward(new Map(), false, () => [0, 0]);
  const cpmEnd = endOf(cpm);
  const cpmLate = backward(cpm, cpmEnd, []);
  // The same backward pass against a far-away end date isolates real deadlines:
  // only tasks squeezed by a pinned finish (their own or downstream) land before the horizon.
  const horizon = new Date(cpmEnd.getTime() + 20 * 365 * 86_400_000);
  const deadlineLate = backward(cpm, horizon, []);
  const deadlineCutoff = horizon.getTime() - 10 * 365 * 86_400_000;
  const rank = (id: string): [number, number] => {
    const byDeadline = deadlineLate.get(id)!.lateStart.getTime();
    return [
      byDeadline < deadlineCutoff ? byDeadline : Number.POSITIVE_INFINITY,
      cpmLate.get(id)!.lateStart.getTime(),
    ];
  };

  const alapBounds = new Map<string, Date>();
  for (const t of tasks) {
    if (t.constraintType === "ALAP" && (t.status === "SCHEDULED" || t.status === "BACKLOG")) {
      alapBounds.set(t.id, cpmLate.get(t.id)!.lateStart);
    }
  }

  // Pass 2: the real plan.
  const placed = forward(alapBounds, level, rank);
  const projectEnd = endOf(placed);

  // Back-to-back work for one person behaves like a dependency: if the first slips, so does the next.
  const resourceEdges: Edge[] = [];
  if (level) {
    const groups = new Map<string, SchedulerTask[]>();
    for (const t of tasks) {
      if (t.status === "DONE" || attendedMinutes(t.id) === 0) continue;
      const key = t.assignee?.trim() || DEFAULT_ASSIGNEE;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    const graph = edges.map((e) => ({ predecessorId: e.predecessorId, successorId: e.successorId }));
    for (const group of groups.values()) {
      const startOf = (t: SchedulerTask) =>
        t.status === "IN_PROGRESS" ? now.getTime() : placed.get(t.id)!.start.getTime();
      group.sort((a, b) => startOf(a) - startOf(b));
      for (let i = 0; i + 1 < group.length; i++) {
        const prev = group[i];
        const next = group[i + 1];
        const p = placed.get(prev.id)!;
        const release = shapes.get(prev.id)!.wait > 0 ? p.attendedEnd : p.finish;
        const gap = cal.between(release, new Date(startOf(next)));
        if (gap > 1 || gap < 0) continue;
        if (wouldCreateCycle(graph, prev.id, next.id)) continue;
        graph.push({ predecessorId: prev.id, successorId: next.id });
        resourceEdges.push({
          predecessorId: prev.id,
          successorId: next.id,
          type: "RESOURCE",
          lagMinutes: 0,
        });
      }
    }
  }
  const late = backward(placed, projectEnd, resourceEdges);

  /* ------------------------------------------------------------- results */

  const criticalPathTaskIds: string[] = [];
  const results: ScheduledTaskResult[] = tasks.map((task) => {
    const p = placed.get(task.id)!;
    const l = late.get(task.id)!;
    const shape = shapes.get(task.id)!;
    const done = task.status === "DONE";

    const pinned = toDate(task.pinnedDate);
    if (pinned && !done) {
      if (task.constraintType === "MUST_START_ON" && task.status !== "IN_PROGRESS") {
        const miss = cal.between(cal.snapForward(pinned), p.start);
        if (miss > 0) {
          addConflict({
            taskId: task.id,
            type: "MUST_START_ON_MISSED",
            minutes: miss,
            message: `"${task.title}" must start on its pinned date but cannot start until ${miss} working minutes later.`,
          });
        }
      }
      if (task.constraintType === "MUST_FINISH_ON" || task.constraintType === "FINISH_NO_LATER_THAN") {
        const miss = cal.between(cal.snapBackward(pinned), p.finish);
        if (miss > 0) {
          addConflict({
            taskId: task.id,
            type: task.constraintType === "MUST_FINISH_ON" ? "MUST_FINISH_ON_MISSED" : "DEADLINE_MISSED",
            minutes: miss,
            message: `"${task.title}" will finish ${miss} working minutes after its deadline.`,
          });
        }
      }
    }

    const totalFloatMinutes = done ? 0 : cal.between(p.finish, l.lateFinish);
    const isCritical = !done && totalFloatMinutes <= CRITICAL_FLOAT_THRESHOLD_MINUTES;
    if (isCritical) criticalPathTaskIds.push(task.id);

    const k = nonNegative(task.interruptionCount);
    const S = nonNegative(task.setupMinutes);
    const T = nonNegative(task.takedownMinutes);

    return {
      ...task,
      earlyStart: p.start,
      earlyFinish: p.finish,
      attendedEnd: p.attendedEnd,
      takedownStart: p.takedownStart,
      lateStart: l.lateStart,
      lateFinish: l.lateFinish,
      totalFloatMinutes,
      isCritical,
      totalPlannedDurationMinutes: done
        ? nonNegative(task.completedWorkMinutes)
        : shape.setup + shape.work + shape.takedown,
      setupMinutesApplied: shape.setup,
      takedownMinutesApplied: shape.takedown,
      unattendedMinutesApplied: shape.wait,
      netWorkRemainingMinutes: shape.work,
      effectiveDurationMinutes:
        (k + 1) * (S + T) + nonNegative(task.baseDurationMinutes) + nonNegative(task.unattendedMinutes),
      overheadMinutes: k * (S + T),
      conflicts: conflicts.get(task.id)!,
    };
  });

  let projectStart = projectStartSetting ? cal.snapForward(projectStartSetting) : floor;
  for (const r of results) projectStart = earlier(projectStart, r.earlyStart);

  return {
    tasks: results,
    projectStart,
    projectEnd,
    criticalPathTaskIds,
    hasCycle: cycleTaskIds.length > 0,
    cycleTaskIds,
    conflicts: results.flatMap((r) => r.conflicts),
  };
}
