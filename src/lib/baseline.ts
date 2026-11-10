import { WorkCalendar } from "./scheduler/calendar";
import type { WorkingCalendarSettings } from "./scheduler/types";

/** Pure comparison of the current plan with a saved baseline. */

export interface BaselineEntryLike {
  taskId: string;
  title: string;
  plannedStart: Date;
  plannedEnd: Date;
}

export interface CurrentTaskLike {
  id: string;
  title: string;
  earlyStart: Date;
  earlyFinish: Date;
}

export type BaselineState = "ON_PLAN" | "SLIPPED" | "AHEAD" | "REMOVED" | "ADDED";

export interface BaselineComparison {
  projectEndPlanned: Date;
  projectEndCurrent: Date;
  /** Working minutes the finish has moved since the baseline (negative = earlier). */
  projectSlipMinutes: number;
  slippedCount: number;
  tasks: Array<{
    taskId: string;
    title: string;
    state: BaselineState;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    currentStart: Date | null;
    currentEnd: Date | null;
    /** Finish slip in working minutes; 0 for added or removed tasks. */
    slipMinutes: number;
  }>;
}

export function compareToBaseline(
  entries: BaselineEntryLike[],
  projectEndPlanned: Date,
  current: CurrentTaskLike[],
  projectEndCurrent: Date,
  settings: WorkingCalendarSettings
): BaselineComparison {
  const cal = new WorkCalendar(settings);
  const now = new Map(current.map((t) => [t.id, t]));
  const planned = new Set(entries.map((e) => e.taskId));

  const tasks: BaselineComparison["tasks"] = entries.map((e) => {
    const t = now.get(e.taskId);
    if (!t) {
      return {
        taskId: e.taskId,
        title: e.title,
        state: "REMOVED" as const,
        plannedStart: e.plannedStart,
        plannedEnd: e.plannedEnd,
        currentStart: null,
        currentEnd: null,
        slipMinutes: 0,
      };
    }
    const slipMinutes = cal.between(e.plannedEnd, t.earlyFinish);
    return {
      taskId: e.taskId,
      title: t.title,
      state: slipMinutes > 0 ? ("SLIPPED" as const) : slipMinutes < 0 ? ("AHEAD" as const) : ("ON_PLAN" as const),
      plannedStart: e.plannedStart,
      plannedEnd: e.plannedEnd,
      currentStart: t.earlyStart,
      currentEnd: t.earlyFinish,
      slipMinutes,
    };
  });

  for (const t of current) {
    if (planned.has(t.id)) continue;
    tasks.push({
      taskId: t.id,
      title: t.title,
      state: "ADDED",
      plannedStart: null,
      plannedEnd: null,
      currentStart: t.earlyStart,
      currentEnd: t.earlyFinish,
      slipMinutes: 0,
    });
  }

  return {
    projectEndPlanned,
    projectEndCurrent,
    projectSlipMinutes: cal.between(projectEndPlanned, projectEndCurrent),
    slippedCount: tasks.filter((t) => t.state === "SLIPPED").length,
    tasks,
  };
}
