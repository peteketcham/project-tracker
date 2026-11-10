import { prisma } from "../prisma";
import { checkBackup } from "../backup-check";
import type { BackupData } from "../validation";

/** Everything in the database as one JSON document. */
export async function exportAll() {
  const [settings, tasks, dependencies, workSessions, interruptionLogs, timeOff, baselines] =
    await Promise.all([
      prisma.projectSettings.findUnique({ where: { id: "default" } }),
      prisma.task.findMany({ orderBy: { order: "asc" } }),
      prisma.taskDependency.findMany(),
      prisma.workSession.findMany({ orderBy: { startTime: "asc" } }),
      prisma.interruptionLog.findMany({ orderBy: { pausedAt: "asc" } }),
      prisma.timeOff.findMany({ orderBy: { start: "asc" } }),
      prisma.baseline.findMany({ include: { entries: true } }),
    ]);
  return {
    version: 1 as const,
    exportedAt: new Date(),
    settings,
    tasks,
    dependencies,
    workSessions,
    interruptionLogs,
    timeOff,
    baselines,
  };
}

/** Replaces the entire database with the backup, or changes nothing. */
export async function importAll(data: BackupData) {
  checkBackup(data);
  const { settings } = data;

  await prisma.$transaction(async (tx) => {
    await tx.baseline.deleteMany();
    await tx.timeOff.deleteMany();
    await tx.interruptionLog.deleteMany();
    await tx.workSession.deleteMany();
    await tx.taskDependency.deleteMany();
    await tx.task.deleteMany();
    await tx.projectSettings.deleteMany();

    if (settings) await tx.projectSettings.create({ data: { id: "default", ...settings } });
    if (data.tasks.length) await tx.task.createMany({ data: data.tasks });
    if (data.dependencies.length) await tx.taskDependency.createMany({ data: data.dependencies });
    if (data.workSessions.length) await tx.workSession.createMany({ data: data.workSessions });
    if (data.interruptionLogs.length) {
      await tx.interruptionLog.createMany({ data: data.interruptionLogs });
    }
    if (data.timeOff.length) await tx.timeOff.createMany({ data: data.timeOff });
    for (const { entries, ...baseline } of data.baselines) {
      await tx.baseline.create({ data: { ...baseline, entries: { create: entries } } });
    }
  });

  return {
    tasks: data.tasks.length,
    dependencies: data.dependencies.length,
    workSessions: data.workSessions.length,
    interruptionLogs: data.interruptionLogs.length,
    timeOff: data.timeOff.length,
    baselines: data.baselines.length,
  };
}
