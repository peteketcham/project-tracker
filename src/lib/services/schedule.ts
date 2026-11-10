import { prisma } from "../prisma";
import { calculateSchedule } from "../scheduler/engine";
import type {
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
export async function getSchedule() {
  const settings = await getSettingsRow();
  const calendar: WorkingCalendarSettings = {
    workingHoursStart: settings.workingHoursStart,
    workingHoursEnd: settings.workingHoursEnd,
    workDays: settings.workDays.split(",").map(Number),
    defaultSetupMinutes: settings.defaultSetupMinutes,
    defaultTakedownMinutes: settings.defaultTakedownMinutes,
    projectStartDate: settings.projectStartDate,
  };

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
      constraintType: t.constraintType as ConstraintType,
      pinnedDate: t.pinnedDate,
      order: t.order,
      completedWorkMinutes: t.workSessions
        .filter((s) => s.sessionType === "WORK" && s.endTime)
        .reduce((sum, s) => sum + s.durationMinutes, 0),
      interruptionCount: t.interruptionLogs.length,
    }));

  const schedulerDeps: SchedulerDependency[] = dependencies.map((d) => ({
    id: d.id,
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type as DependencyType,
    lagMinutes: d.lagMinutes,
  }));

  const schedule = calculateSchedule(schedulerTasks, schedulerDeps, calendar);
  const byId = new Map(schedule.tasks.map((t) => [t.id, t]));

  const enriched = tasks.map((task) => {
    const s = byId.get(task.id);
    return {
      ...task,
      scheduledStart: s?.earlyStart ?? null,
      scheduledEnd: s?.earlyFinish ?? null,
      lateStart: s?.lateStart ?? null,
      lateFinish: s?.lateFinish ?? null,
      totalFloatMinutes: s?.totalFloatMinutes ?? null,
      isCritical: s?.isCritical ?? false,
      totalPlannedDurationMinutes:
        s?.totalPlannedDurationMinutes ??
        task.setupMinutes + task.baseDurationMinutes + task.takedownMinutes,
      setupMinutesApplied: s?.setupMinutesApplied ?? task.setupMinutes,
      takedownMinutesApplied: s?.takedownMinutesApplied ?? task.takedownMinutes,
    };
  });

  return {
    tasks: enriched,
    dependencies,
    settings,
    scheduleOverview: {
      projectStart: schedule.projectStart,
      projectEnd: schedule.projectEnd,
      criticalPathTaskIds: schedule.criticalPathTaskIds,
      hasCycle: schedule.hasCycle,
    },
    schedule,
  };
}
