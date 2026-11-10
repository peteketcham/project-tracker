import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError, conflict, notFound } from "../errors";
import { wouldCreateCycle } from "../tasks/graph";
import {
  actionForStatus,
  planTransition,
  type TransitionAction,
} from "../tasks/transitions";
import type { TaskStatus } from "../scheduler/types";
import type {
  DependencyInput,
  PlanInput,
  TaskCreateInput,
  TaskUpdateInput,
} from "../validation";

type Tx = Prisma.TransactionClient;

/* ------------------------------------------------------------------ tasks */

export async function createTask(input: TaskCreateInput, tx: Tx = prisma) {
  const last = await tx.task.aggregate({ _max: { order: true } });
  return tx.task.create({ data: { ...input, order: (last._max.order ?? 0) + 1 } });
}

export async function updateTask(id: string, input: TaskUpdateInput) {
  const { status, ...fields } = input;
  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { id } });
    if (!existing) throw notFound("Task");
    let task = existing;
    if (Object.keys(fields).length > 0) {
      task = await tx.task.update({ where: { id }, data: fields });
    }
    if (status && status !== task.status) {
      task = await applyTransition(tx, id, actionForStatus(status), {});
    }
    return task;
  });
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
  return { success: true, id };
}

/* ------------------------------------------------------------ transitions */

export interface TransitionRequest {
  reason?: string;
  elapsedMinutes?: number;
  now?: Date;
}

async function applyTransition(
  tx: Tx,
  taskId: string,
  action: TransitionAction,
  req: TransitionRequest
) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: { workSessions: { where: { endTime: null } } },
  });
  if (!task) throw notFound("Task");

  const now = req.now ?? new Date();
  const plan = planTransition(
    { ...task, status: task.status as TaskStatus },
    task.workSessions,
    action,
    { now, reason: req.reason, elapsedMinutes: req.elapsedMinutes }
  );

  for (const s of plan.closeSessions) {
    await tx.workSession.update({
      where: { id: s.id },
      data: { endTime: s.endTime, durationMinutes: s.durationMinutes },
    });
  }
  for (const s of plan.createSessions) {
    await tx.workSession.create({ data: { taskId, ...s } });
  }
  if (plan.createInterruption) {
    await tx.interruptionLog.create({ data: { taskId, ...plan.createInterruption } });
  }
  if (plan.resolveInterruptionAt) {
    const open = await tx.interruptionLog.findFirst({
      where: { taskId, resumedAt: null },
      orderBy: { pausedAt: "desc" },
    });
    if (open) {
      await tx.interruptionLog.update({
        where: { id: open.id },
        data: { resumedAt: plan.resolveInterruptionAt },
      });
    }
  }
  return tx.task.update({ where: { id: taskId }, data: plan.taskUpdate });
}

/** The only way task status changes: REST, MCP and drag-and-drop all land here. */
export function transitionTask(taskId: string, action: TransitionAction, req: TransitionRequest = {}) {
  return prisma.$transaction((tx) => applyTransition(tx, taskId, action, req));
}

/* ----------------------------------------------------------- dependencies */

export async function addDependency(input: DependencyInput) {
  const { predecessorId, successorId, type, lagMinutes } = input;
  return prisma.$transaction(async (tx) => {
    const found = await tx.task.count({ where: { id: { in: [predecessorId, successorId] } } });
    if (found !== 2) throw notFound("Task");

    const edges = await tx.taskDependency.findMany({
      select: { predecessorId: true, successorId: true },
    });
    const others = edges.filter(
      (e) => !(e.predecessorId === predecessorId && e.successorId === successorId)
    );
    if (wouldCreateCycle(others, predecessorId, successorId)) {
      throw conflict(
        "That link would create a dependency cycle: the prerequisite already depends on this task."
      );
    }

    return tx.taskDependency.upsert({
      where: { predecessorId_successorId: { predecessorId, successorId } },
      update: { type, lagMinutes },
      create: { predecessorId, successorId, type, lagMinutes },
    });
  });
}

export async function removeDependency(id: string) {
  await prisma.taskDependency.delete({ where: { id } });
  return { success: true, id };
}

export async function removeDependencyBetween(predecessorId: string, successorId: string) {
  await prisma.taskDependency.delete({
    where: { predecessorId_successorId: { predecessorId, successorId } },
  });
  return { success: true };
}

/* ------------------------------------------------------------------ plans */

/** Creates a whole batch of tasks and links, or nothing at all. */
export async function createPlan(plan: PlanInput) {
  // The keys were validated already; make sure the new links do not loop.
  const edges: Array<{ predecessorId: string; successorId: string }> = [];
  for (const d of plan.dependencies) {
    if (wouldCreateCycle(edges, d.predecessorKey, d.successorKey)) {
      throw new ApiError(400, `Dependencies form a cycle at ${d.predecessorKey} -> ${d.successorKey}`);
    }
    edges.push({ predecessorId: d.predecessorKey, successorId: d.successorKey });
  }

  return prisma.$transaction(async (tx) => {
    const last = await tx.task.aggregate({ _max: { order: true } });
    let order = last._max.order ?? 0;
    const keyToId = new Map<string, string>();
    const tasks = [];

    for (const { tempKey, ...data } of plan.tasks) {
      order += 1;
      const task = await tx.task.create({ data: { ...data, order } });
      keyToId.set(tempKey, task.id);
      tasks.push(task);
    }

    const seen = new Set<string>();
    let dependencyCount = 0;
    for (const d of plan.dependencies) {
      const pair = `${d.predecessorKey}>${d.successorKey}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      await tx.taskDependency.create({
        data: {
          predecessorId: keyToId.get(d.predecessorKey)!,
          successorId: keyToId.get(d.successorKey)!,
          type: d.type,
          lagMinutes: d.lagMinutes,
        },
      });
      dependencyCount += 1;
    }

    return { tasks, dependencyCount, keyToId: Object.fromEntries(keyToId) };
  });
}
