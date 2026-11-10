import { prisma } from "../prisma";
import { notFound } from "../errors";
import { compareToBaseline } from "../baseline";
import { getSchedule, toCalendarSettings } from "./schedule";

export async function listBaselines() {
  const rows = await prisma.baseline.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
  return rows.map(({ _count, ...b }) => ({ ...b, taskCount: _count.entries }));
}

/** Saves the current plan's dates under a name. */
export async function saveBaseline(name: string, now: Date = new Date()) {
  const { schedule } = await getSchedule(now);
  return prisma.baseline.create({
    data: {
      name,
      projectEnd: schedule.projectEnd,
      entries: {
        create: schedule.tasks.map((t) => ({
          taskId: t.id,
          title: t.title,
          plannedStart: t.earlyStart,
          plannedEnd: t.earlyFinish,
        })),
      },
    },
  });
}

export async function deleteBaseline(id: string) {
  await prisma.baseline.delete({ where: { id } });
  return { success: true, id };
}

export async function compareBaseline(id: string, now: Date = new Date()) {
  const baseline = await prisma.baseline.findUnique({ where: { id }, include: { entries: true } });
  if (!baseline) throw notFound("Baseline");
  const { schedule, settings } = await getSchedule(now);
  return {
    id: baseline.id,
    name: baseline.name,
    createdAt: baseline.createdAt,
    ...compareToBaseline(
      baseline.entries,
      baseline.projectEnd,
      schedule.tasks,
      schedule.projectEnd,
      toCalendarSettings(settings)
    ),
  };
}
