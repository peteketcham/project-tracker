import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateSchedule } from "@/lib/scheduler/engine";
import { WorkingCalendarSettings } from "@/lib/scheduler/types";
import { route, readJson, created } from "@/lib/api";
import { taskCreateSchema } from "@/lib/validation";

export const GET = route(async () => {
  {
    let settings = await prisma.projectSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.projectSettings.create({
        data: { id: "default" },
      });
    }

    const calendarSettings: WorkingCalendarSettings = {
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
        dependenciesAsSuccessor: {
          include: { predecessor: true },
        },
        dependenciesAsPredecessor: {
          include: { successor: true },
        },
        workSessions: {
          orderBy: { startTime: "asc" },
        },
        interruptionLogs: {
          orderBy: { pausedAt: "desc" },
        },
      },
    });

    const allDependencies = await prisma.taskDependency.findMany();

    // Prepare for scheduler
    const nonBacklogTasks = tasks.filter((t) => t.status !== "BACKLOG");

    const schedulerTasks = nonBacklogTasks.map((t) => {
      const completedWork = t.workSessions
        .filter((s) => s.sessionType === "WORK" && s.endTime)
        .reduce((sum, s) => sum + s.durationMinutes, 0);

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status as any,
        priority: t.priority as any,
        baseDurationMinutes: t.baseDurationMinutes,
        setupMinutes: t.setupMinutes,
        takedownMinutes: t.takedownMinutes,
        constraintType: t.constraintType as any,
        pinnedDate: t.pinnedDate,
        order: t.order,
        completedWorkMinutes: completedWork,
        interruptionCount: t.interruptionLogs.length,
        color: t.color,
      };
    });

    const schedulerDeps = allDependencies.map((d) => ({
      id: d.id,
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.type as any,
      lagMinutes: d.lagMinutes,
    }));

    const schedule = calculateSchedule(schedulerTasks, schedulerDeps, calendarSettings);

    // Map scheduled dates back to tasks
    const scheduledTaskMap = new Map(schedule.tasks.map((st) => [st.id, st]));

    const enrichedTasks = tasks.map((task) => {
      const scheduledInfo = scheduledTaskMap.get(task.id);
      return {
        ...task,
        scheduledStart: scheduledInfo?.earlyStart || null,
        scheduledEnd: scheduledInfo?.earlyFinish || null,
        lateStart: scheduledInfo?.lateStart || null,
        lateFinish: scheduledInfo?.lateFinish || null,
        totalFloatMinutes: scheduledInfo?.totalFloatMinutes ?? null,
        isCritical: scheduledInfo?.isCritical || false,
        totalPlannedDurationMinutes:
          scheduledInfo?.totalPlannedDurationMinutes ||
          task.setupMinutes + task.baseDurationMinutes + task.takedownMinutes,
        setupMinutesApplied: scheduledInfo?.setupMinutesApplied || task.setupMinutes,
        takedownMinutesApplied: scheduledInfo?.takedownMinutesApplied || task.takedownMinutes,
      };
    });

    return NextResponse.json({
      tasks: enrichedTasks,
      dependencies: allDependencies,
      settings,
      scheduleOverview: {
        projectStart: schedule.projectStart,
        projectEnd: schedule.projectEnd,
        criticalPathTaskIds: schedule.criticalPathTaskIds,
        hasCycle: schedule.hasCycle,
      },
    });
  }
});

export const POST = route(async (req) => {
  const data = await readJson(req, taskCreateSchema);
  const count = await prisma.task.count();
  const task = await prisma.task.create({ data: { ...data, order: count + 1 } });
  return created(task);
});
