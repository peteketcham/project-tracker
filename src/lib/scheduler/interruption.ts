import { prisma } from "../prisma";

export interface PauseTaskOptions {
  taskId: string;
  reason?: string;
  elapsedWorkMinutes?: number;
}

export interface ResumeTaskOptions {
  taskId: string;
}

/**
 * Handles interrupting a task:
 * 1. Completes any active work session.
 * 2. Creates a takedown work session (incurring the takedown context penalty).
 * 3. Logs the interruption event.
 * 4. Sets task status to PAUSED.
 */
export async function pauseTask({
  taskId,
  reason,
  elapsedWorkMinutes,
}: PauseTaskOptions) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { workSessions: true },
  });

  if (!task) throw new Error(`Task with id ${taskId} not found`);

  const now = new Date();

  // Find active open session if any
  const openSession = task.workSessions.find((s) => !s.endTime);
  if (openSession) {
    const sessionDuration = elapsedWorkMinutes ?? Math.max(
      1,
      Math.round((now.getTime() - new Date(openSession.startTime).getTime()) / (1000 * 60))
    );
    await prisma.workSession.update({
      where: { id: openSession.id },
      data: {
        endTime: now,
        durationMinutes: sessionDuration,
      },
    });
  } else if (elapsedWorkMinutes && elapsedWorkMinutes > 0) {
    await prisma.workSession.create({
      data: {
        taskId,
        sessionType: "WORK",
        startTime: new Date(now.getTime() - elapsedWorkMinutes * 60 * 1000),
        endTime: now,
        durationMinutes: elapsedWorkMinutes,
      },
    });
  }

  // Create takedown penalty session
  if (task.takedownMinutes > 0) {
    await prisma.workSession.create({
      data: {
        taskId,
        sessionType: "TAKEDOWN",
        startTime: now,
        endTime: new Date(now.getTime() + task.takedownMinutes * 60 * 1000),
        durationMinutes: task.takedownMinutes,
      },
    });
  }

  // Record interruption log
  const overheadAdded = task.takedownMinutes + task.setupMinutes;
  await prisma.interruptionLog.create({
    data: {
      taskId,
      pausedAt: now,
      reason: reason || "User switched task / interrupted",
      overheadAddedMinutes: overheadAdded,
    },
  });

  // Update status to PAUSED
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: { status: "PAUSED" },
  });

  return updatedTask;
}

/**
 * Handles resuming a paused task:
 * 1. Injects setup context restoration session.
 * 2. Sets task status to IN_PROGRESS.
 */
export async function resumeTask({ taskId }: ResumeTaskOptions) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { interruptionLogs: { orderBy: { pausedAt: "desc" }, take: 1 } },
  });

  if (!task) throw new Error(`Task with id ${taskId} not found`);

  const now = new Date();

  // Close the latest open interruption log
  if (task.interruptionLogs.length > 0 && !task.interruptionLogs[0].resumedAt) {
    await prisma.interruptionLog.update({
      where: { id: task.interruptionLogs[0].id },
      data: { resumedAt: now },
    });
  }

  // Create setup warm-up session
  if (task.setupMinutes > 0) {
    await prisma.workSession.create({
      data: {
        taskId,
        sessionType: "SETUP",
        startTime: now,
        endTime: new Date(now.getTime() + task.setupMinutes * 60 * 1000),
        durationMinutes: task.setupMinutes,
      },
    });
  }

  // Start new active work session
  await prisma.workSession.create({
    data: {
      taskId,
      sessionType: "WORK",
      startTime: now,
    },
  });

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "IN_PROGRESS",
      actualStart: task.actualStart ?? now,
    },
  });

  return updatedTask;
}
