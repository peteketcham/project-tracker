import { ApiError } from "../errors";
import type { TaskStatus } from "../scheduler/types";

/**
 * The task state machine. Pure: given the task, its open sessions, an action and
 * the current time, it returns the writes to perform (or throws if the move is
 * not allowed). The database executor lives in services/tasks.ts.
 *
 *   BACKLOG <-> SCHEDULED --START--> IN_PROGRESS --PAUSE--> PAUSED
 *                                        ^                     |
 *                                        +------RESUME---------+
 *   any except DONE --COMPLETE--> DONE --MOVE_*--> BACKLOG | SCHEDULED (reopen)
 */

export type TransitionAction =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "MOVE_BACKLOG"
  | "MOVE_SCHEDULED";

export interface TransitionTask {
  id: string;
  title: string;
  status: TaskStatus;
  setupMinutes: number;
  takedownMinutes: number;
  actualStart: Date | null;
}

export interface OpenSession {
  id: string;
  sessionType: string;
  startTime: Date;
}

export interface TransitionOptions {
  now: Date;
  reason?: string;
  /** Overrides the measured length of the open work session, in minutes. */
  elapsedMinutes?: number;
}

export interface NewSession {
  sessionType: "SETUP" | "WORK" | "TAKEDOWN";
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number;
}

export interface TransitionPlan {
  closeSessions: Array<{ id: string; endTime: Date; durationMinutes: number }>;
  createSessions: NewSession[];
  createInterruption: { pausedAt: Date; reason: string; overheadAddedMinutes: number } | null;
  /** Stamp resumedAt on the latest unresolved interruption. */
  resolveInterruptionAt: Date | null;
  taskUpdate: { status: TaskStatus; actualStart?: Date | null; actualEnd?: Date | null };
}

const MIN = 60_000;
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * MIN);

export const DEFAULT_INTERRUPTION_REASON = "User switched task / interrupted";

/** Maps a target board column to the action that gets a task there. */
export function actionForStatus(target: TaskStatus): TransitionAction {
  switch (target) {
    case "IN_PROGRESS":
      return "START";
    case "PAUSED":
      return "PAUSE";
    case "DONE":
      return "COMPLETE";
    case "BACKLOG":
      return "MOVE_BACKLOG";
    case "SCHEDULED":
      return "MOVE_SCHEDULED";
  }
}

function refuse(task: TransitionTask, action: string, hint: string): never {
  throw new ApiError(409, `Cannot ${action} "${task.title}" while it is ${task.status}. ${hint}`);
}

function closeOpen(open: OpenSession[], opts: TransitionOptions) {
  return open.map((s) => {
    const measured = Math.max(0, Math.round((opts.now.getTime() - s.startTime.getTime()) / MIN));
    const durationMinutes =
      s.sessionType === "WORK" && opts.elapsedMinutes !== undefined ? opts.elapsedMinutes : measured;
    return { id: s.id, endTime: opts.now, durationMinutes };
  });
}

/** Setup happens first; focused work is only counted once setup is over. */
function beginWork(task: TransitionTask, now: Date): NewSession[] {
  const sessions: NewSession[] = [];
  const workStart = addMinutes(now, task.setupMinutes);
  if (task.setupMinutes > 0) {
    sessions.push({
      sessionType: "SETUP",
      startTime: now,
      endTime: workStart,
      durationMinutes: task.setupMinutes,
    });
  }
  sessions.push({ sessionType: "WORK", startTime: workStart, endTime: null, durationMinutes: 0 });
  return sessions;
}

function takedown(task: TransitionTask, now: Date): NewSession[] {
  if (task.takedownMinutes <= 0) return [];
  return [
    {
      sessionType: "TAKEDOWN",
      startTime: now,
      endTime: addMinutes(now, task.takedownMinutes),
      durationMinutes: task.takedownMinutes,
    },
  ];
}

export function planTransition(
  task: TransitionTask,
  openSessions: OpenSession[],
  action: TransitionAction,
  opts: TransitionOptions
): TransitionPlan {
  const { now } = opts;
  const plan: TransitionPlan = {
    closeSessions: [],
    createSessions: [],
    createInterruption: null,
    resolveInterruptionAt: null,
    taskUpdate: { status: task.status },
  };

  switch (action) {
    case "START":
    case "RESUME": {
      if (task.status === "IN_PROGRESS") refuse(task, "start", "It is already running.");
      if (task.status === "DONE") refuse(task, "start", "Reopen it first.");
      if (action === "RESUME" && task.status !== "PAUSED") {
        refuse(task, "resume", "Only paused tasks can be resumed.");
      }
      plan.closeSessions = closeOpen(openSessions, opts); // defensive: none expected
      plan.createSessions = beginWork(task, now);
      if (task.status === "PAUSED") plan.resolveInterruptionAt = now;
      plan.taskUpdate = { status: "IN_PROGRESS", actualStart: task.actualStart ?? now };
      return plan;
    }

    case "PAUSE": {
      if (task.status !== "IN_PROGRESS") refuse(task, "pause", "Only running tasks can be paused.");
      plan.closeSessions = closeOpen(openSessions, opts);
      plan.createSessions = takedown(task, now);
      plan.createInterruption = {
        pausedAt: now,
        reason: opts.reason?.trim() || DEFAULT_INTERRUPTION_REASON,
        overheadAddedMinutes: task.takedownMinutes + task.setupMinutes,
      };
      plan.taskUpdate = { status: "PAUSED" };
      return plan;
    }

    case "COMPLETE": {
      if (task.status === "DONE") refuse(task, "complete", "It is already done.");
      plan.closeSessions = closeOpen(openSessions, opts);
      if (task.status === "IN_PROGRESS") {
        // Wrapping up still takes the takedown time from now.
        plan.createSessions = takedown(task, now);
        plan.taskUpdate = { status: "DONE", actualEnd: addMinutes(now, task.takedownMinutes) };
      } else {
        plan.taskUpdate = {
          status: "DONE",
          actualStart: task.actualStart ?? now,
          actualEnd: now,
        };
      }
      return plan;
    }

    case "MOVE_BACKLOG":
    case "MOVE_SCHEDULED": {
      const target: TaskStatus = action === "MOVE_BACKLOG" ? "BACKLOG" : "SCHEDULED";
      if (task.status === "IN_PROGRESS") {
        refuse(task, `move to ${target}`, "Pause or complete it first.");
      }
      plan.taskUpdate =
        task.status === "DONE" ? { status: target, actualEnd: null } : { status: target };
      return plan;
    }
  }
}
