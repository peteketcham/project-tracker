import { prisma } from "../prisma";
import { computeInsights } from "../insights";

export async function getInsights(now: Date = new Date()) {
  const tasks = await prisma.task.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      baseDurationMinutes: true,
      workSessions: true,
      interruptionLogs: true,
    },
  });
  return computeInsights(tasks, now);
}
