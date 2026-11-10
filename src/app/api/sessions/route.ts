import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pauseTask, resumeTask } from "@/lib/scheduler/interruption";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskId, action, reason, elapsedMinutes } = body;

    if (!taskId || !action) {
      return NextResponse.json(
        { error: "taskId and action are required" },
        { status: 400 }
      );
    }

    if (action === "PAUSE") {
      const task = await pauseTask({
        taskId,
        reason,
        elapsedWorkMinutes: elapsedMinutes,
      });
      return NextResponse.json({ success: true, task, action: "PAUSE" });
    }

    if (action === "RESUME") {
      const task = await resumeTask({ taskId });
      return NextResponse.json({ success: true, task, action: "RESUME" });
    }

    if (action === "START") {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

      const now = new Date();
      // Setup buffer session
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

      // Active work session
      await prisma.workSession.create({
        data: {
          taskId,
          sessionType: "WORK",
          startTime: now,
        },
      });

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "IN_PROGRESS",
          actualStart: task.actualStart ?? now,
        },
      });

      return NextResponse.json({ success: true, task: updated, action: "START" });
    }

    if (action === "COMPLETE") {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { workSessions: true },
      });
      if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

      const now = new Date();
      // Close open session
      const openSession = task.workSessions.find((s) => !s.endTime);
      if (openSession) {
        const duration = Math.max(
          1,
          Math.round((now.getTime() - new Date(openSession.startTime).getTime()) / (1000 * 60))
        );
        await prisma.workSession.update({
          where: { id: openSession.id },
          data: {
            endTime: now,
            durationMinutes: duration,
          },
        });
      }

      // Takedown buffer session
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

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "DONE",
          actualEnd: now,
        },
      });

      return NextResponse.json({ success: true, task: updated, action: "COMPLETE" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Session action error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
