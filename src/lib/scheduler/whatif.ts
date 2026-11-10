import { calculateSchedule } from "./engine";
import { WorkCalendar } from "./calendar";
import type {
  ScheduleConflict,
  SchedulerDependency,
  SchedulerTask,
  WorkingCalendarSettings,
} from "./types";

/** A hypothetical change to try against the current plan without saving anything. */
export type WhatIfChange =
  | { type: "interrupt"; taskId: string }
  | { type: "extend"; taskId: string; minutes: number }
  | { type: "time_off"; start: Date; end: Date }
  | { type: "drop"; taskId: string };

export interface WhatIfResult {
  projectEndBefore: Date;
  projectEndAfter: Date;
  /** Working minutes the finish date moves (negative = earlier). */
  projectSlipMinutes: number;
  slippedTasks: Array<{
    taskId: string;
    title: string;
    finishBefore: Date;
    finishAfter: Date;
    slipMinutes: number;
  }>;
  newConflicts: ScheduleConflict[];
}

const MIN = 60_000;

export function whatIf(
  tasks: SchedulerTask[],
  dependencies: SchedulerDependency[],
  settings: WorkingCalendarSettings,
  now: Date,
  change: WhatIfChange
): WhatIfResult {
  let nextTasks = tasks;
  let nextDeps = dependencies;
  let nextSettings = settings;

  if (change.type === "time_off") {
    nextSettings = {
      ...settings,
      busy: [...(settings.busy ?? []), { start: change.start, end: change.end }],
    };
  } else {
    if (!tasks.some((t) => t.id === change.taskId)) {
      throw new Error(`Task ${change.taskId} is not in the schedule`);
    }
    if (change.type === "drop") {
      nextTasks = tasks.filter((t) => t.id !== change.taskId);
      nextDeps = dependencies.filter(
        (d) => d.predecessorId !== change.taskId && d.successorId !== change.taskId
      );
    } else {
      nextTasks = tasks.map((t) => {
        if (t.id !== change.taskId) return t;
        if (change.type === "extend") {
          return { ...t, baseDurationMinutes: Math.max(1, t.baseDurationMinutes + change.minutes) };
        }
        // interrupt: bank the work done so far, then it needs takedown now and setup again later
        const open = t.openWorkSessionStart ? new Date(t.openWorkSessionStart) : null;
        const worked = open ? Math.max(0, Math.floor((now.getTime() - open.getTime()) / MIN)) : 0;
        return {
          ...t,
          status: "PAUSED" as const,
          openWorkSessionStart: null,
          completedWorkMinutes: (t.completedWorkMinutes ?? 0) + worked,
          interruptionCount: (t.interruptionCount ?? 0) + 1,
        };
      });
    }
  }

  const before = calculateSchedule(tasks, dependencies, settings, now);
  const after = calculateSchedule(nextTasks, nextDeps, nextSettings, now);
  const cal = new WorkCalendar(settings);
  const beforeById = new Map(before.tasks.map((t) => [t.id, t]));
  const seen = new Set(before.conflicts.map((c) => `${c.taskId}:${c.type}`));

  const slippedTasks = after.tasks
    .map((t) => {
      const b = beforeById.get(t.id);
      if (!b || t.status === "DONE") return null;
      const slipMinutes = cal.between(b.earlyFinish, t.earlyFinish);
      return slipMinutes === 0
        ? null
        : {
            taskId: t.id,
            title: t.title,
            finishBefore: b.earlyFinish,
            finishAfter: t.earlyFinish,
            slipMinutes,
          };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.slipMinutes - a.slipMinutes);

  return {
    projectEndBefore: before.projectEnd,
    projectEndAfter: after.projectEnd,
    projectSlipMinutes: cal.between(before.projectEnd, after.projectEnd),
    slippedTasks,
    newConflicts: after.conflicts.filter((c) => !seen.has(`${c.taskId}:${c.type}`)),
  };
}
