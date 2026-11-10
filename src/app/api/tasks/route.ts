import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateSchedule } from "@/lib/scheduler/engine";
import { WorkingCalendarSettings } from "@/lib/scheduler/types";

export async function GET() {
  try {
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
  } catch (error: any) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const count = await prisma.task.count();

    const task = await prisma.task.create({
      data: {
        title: body.title || "Untitled Task",
        description: body.description || null,
        status: body.status || "SCHEDULED",
        priority: body.priority || "MEDIUM",
        baseDurationMinutes: Number(body.baseDurationMinutes) || 60,
        setupMinutes: body.setupMinutes !== undefined ? Number(body.setupMinutes) : 15,
        takedownMinutes: body.takedownMinutes !== undefined ? Number(body.takedownMinutes) : 10,
        constraintType: body.constraintType || "ASAP",
        pinnedDate: body.pinnedDate ? new Date(body.pinnedDate) : null,
        color: body.color || "#3b82f6",
        order: count + 1,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
