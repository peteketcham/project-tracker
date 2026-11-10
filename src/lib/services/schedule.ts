import { prisma } from "../prisma";
import { calculateSchedule } from "../scheduler/engine";
import { whatIf, type WhatIfChange } from "../scheduler/whatif";
import { ApiError } from "../errors";
import type { WhatIfInput } from "../validation";
import type {
  BusyBlock,
  ConstraintType,
  DependencyType,
  SchedulerDependency,
  SchedulerTask,
  TaskPriority,
  TaskStatus,
  WorkingCalendarSettings,
} from "../scheduler/types";

export async function getSettingsRow() {
  return prisma.projectSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

/**
 * Loads everything, runs the scheduler, and returns tasks enriched with their
 * computed dates. Shared by GET /api/tasks and the MCP schedule tools.
 */
export type SettingsRow = Awaited<ReturnType<typeof getSettingsRow>>;

export function toCalendarSettings(
  settings: SettingsRow,
  busy: BusyBlock[] = []
): WorkingCalendarSettings {
  return {
    workingHoursStart: settings.workingHoursStart,
    workingHoursEnd: settings.workingHoursEnd,
    workDays: settings.workDays.split(",").map(Number),
    timezone: settings.timezone,
    levelResources: settings.levelResources,
    projectStartDate: settings.projectStartDate,
    busy,
  };
}

/** Everything the scheduler needs, read from the database. */
export async function loadScheduleInputs(now: Date = new Date()) {
  const settings = await getSettingsRow();
  const tasks = await prisma.task.findMany({
    orderBy: { order: "asc" },
    include: {
      dependenciesAsSuccessor: { include: { predecessor: { select: { id: true, title: true } } } },
      dependenciesAsPredecessor: { include: { successor: { select: { id: true, title: true } } } },
      workSessions: { orderBy: { startTime: "asc" } },
      interruptionLogs: { orderBy: { pausedAt: "desc" } },
    },
  });
  const dependencies = await prisma.taskDependency.findMany();
  const timeOff = await prisma.timeOff.findMany({
    where: { end: { gte: new Date(now.getTime() - 86_400_000) } },
    select: { start: true, end: true },
  });

  const schedulerTasks: SchedulerTask[] = tasks
    .filter((t) => t.status !== "BACKLOG")
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      baseDurationMinutes: t.baseDurationMinutes,
      setupMinutes: t.setupMinutes,
      takedownMinutes: t.takedownMinutes,
      unattendedMinutes: t.unattendedMinutes,
      assignee: t.assignee,
      constraintType: t.constraintType as ConstraintType,
      pinnedDate: t.pinnedDate,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      order: t.order,
      completedWorkMinutes: t.workSessions
        .filter((s) => s.sessionType === "WORK" && s.endTime)
        .reduce((sum, s) => sum + s.durationMinutes, 0),
      openWorkSessionStart:
        t.workSessions.find((s) => s.sessionType === "WORK" && !s.endTime)?.startTime ?? null,
      interruptionCount: t.interruptionLogs.length,
    }));

  const schedulerDeps: SchedulerDependency[] = dependencies.map((d) => ({
    id: d.id,
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type as DependencyType,
    lagMinutes: d.lagMinutes,
  }));

  return {
    settings,
    tasks,
    dependencies,
    schedulerTasks,
    schedulerDeps,
    calendar: toCalendarSettings(settings, timeOff),
  };
}

/**
 * Loads everything, runs the scheduler, and returns tasks enriched with their
 * computed dates. Shared by GET /api/tasks and the MCP schedule tools.
 */
export async function getSchedule(now: Date = new Date()) {
  const { settings, tasks, dependencies, schedulerTasks, schedulerDeps, calendar } =
    await loadScheduleInputs(now);

  const schedule = calculateSchedule(schedulerTasks, schedulerDeps, calendar, now);
  const byId = new Map(schedule.tasks.map((t) => [t.id, t]));

  const enriched = tasks.map((task) => {
    const s = byId.get(task.id);
    return {
      ...task,
      scheduledStart: s?.earlyStart ?? null,
      scheduledEnd: s?.earlyFinish ?? null,
      attendedEnd: s?.attendedEnd ?? null,
      takedownStart: s?.takedownStart ?? null,
      lateStart: s?.lateStart ?? null,
      lateFinish: s?.lateFinish ?? null,
      totalFloatMinutes: s?.totalFloatMinutes ?? null,
      isCritical: s?.isCritical ?? false,
      totalPlannedDurationMinutes:
        s?.totalPlannedDurationMinutes ??
        task.setupMinutes + task.baseDurationMinutes + task.takedownMinutes,
      setupMinutesApplied: s?.setupMinutesApplied ?? task.setupMinutes,
      takedownMinutesApplied: s?.takedownMinutesApplied ?? task.takedownMinutes,
      netWorkRemainingMinutes: s?.netWorkRemainingMinutes ?? task.baseDurationMinutes,
      effectiveDurationMinutes: s?.effectiveDurationMinutes ?? null,
      overheadMinutes: s?.overheadMinutes ?? 0,
      conflicts: s?.conflicts ?? [],
    };
  });

  return {
    tasks: enriched,
    dependencies,
    settings,
    scheduleOverview: {
      now,
      projectStart: schedule.projectStart,
      projectEnd: schedule.projectEnd,
      criticalPathTaskIds: schedule.criticalPathTaskIds,
      hasCycle: schedule.hasCycle,
      cycleTaskIds: schedule.cycleTaskIds,
      conflicts: schedule.conflicts,
    },
    schedule,
  };
}

/** Tries a hypothetical change against the live plan. Nothing is saved. */
export async function runWhatIf(input: WhatIfInput, now: Date = new Date()) {
  const { schedulerTasks, schedulerDeps, calendar } = await loadScheduleInputs(now);
  let change: WhatIfChange;
  if (input.type === "time_off") change = { type: "time_off", start: input.start!, end: input.end! };
  else if (input.type === "extend") change = { type: "extend", taskId: input.taskId!, minutes: input.minutes! };
  else change = { type: input.type, taskId: input.taskId! };

  if (change.type !== "time_off") {
    const id = change.taskId;
    const task = schedulerTasks.find((t) => t.id === id);
    if (!task) throw new ApiError(404, "Task not found in the schedule (backlog tasks are not scheduled)");
    if (change.type === "interrupt" && task.status !== "IN_PROGRESS") {
      throw new ApiError(409, `"${task.title}" is not in progress, so it cannot be interrupted`);
    }
  }
  return whatIf(schedulerTasks, schedulerDeps, calendar, now, change);
}
