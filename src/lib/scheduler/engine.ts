import {
  SchedulerTask,
  SchedulerDependency,
  WorkingCalendarSettings,
  ScheduledTaskResult,
  ScheduleCalculationResult,
} from "./types";
import {
  snapToNextWorkingTime,
  snapToPreviousWorkingTime,
  addWorkingMinutes,
  subtractWorkingMinutes,
  getWorkingMinutesBetween,
} from "./calendar";
import { isAfter, isBefore } from "date-fns";

export function calculateSchedule(
  tasks: SchedulerTask[],
  dependencies: SchedulerDependency[],
  settings: WorkingCalendarSettings
): ScheduleCalculationResult {
  // If no tasks, return empty result
  if (tasks.length === 0) {
    const now = snapToNextWorkingTime(new Date(), settings);
    return {
      tasks: [],
      projectStart: now,
      projectEnd: now,
      criticalPathTaskIds: [],
      hasCycle: false,
    };
  }

  const taskMap = new Map<string, SchedulerTask>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  // Build adjacency graph
  const inDegree = new Map<string, number>();
  const adj = new Map<string, SchedulerDependency[]>();
  const reverseAdj = new Map<string, SchedulerDependency[]>();

  tasks.forEach((t) => {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
    reverseAdj.set(t.id, []);
  });

  const validDependencies = dependencies.filter(
    (dep) => taskMap.has(dep.predecessorId) && taskMap.has(dep.successorId)
  );

  validDependencies.forEach((dep) => {
    adj.get(dep.predecessorId)!.push(dep);
    reverseAdj.get(dep.successorId)!.push(dep);
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) || 0) + 1);
  });

  // Kahn's algorithm for Topological Sort
  const queue: string[] = [];
  inDegree.forEach((degree, taskId) => {
    if (degree === 0) queue.push(taskId);
  });

  const topoOrder: string[] = [];
  const tempInDegree = new Map(inDegree);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    topoOrder.push(currentId);

    const outgoing = adj.get(currentId) || [];
    for (const dep of outgoing) {
      const nextId = dep.successorId;
      const newDegree = (tempInDegree.get(nextId) || 1) - 1;
      tempInDegree.set(nextId, newDegree);
      if (newDegree === 0) {
        queue.push(nextId);
      }
    }
  }

  const hasCycle = topoOrder.length !== tasks.length;
  // If there's a cycle, append remaining unvisited tasks at the end to keep app resilient
  if (hasCycle) {
    tasks.forEach((t) => {
      if (!topoOrder.includes(t.id)) topoOrder.push(t.id);
    });
  }

  // Project baseline start
  const baseProjectStart = settings.projectStartDate
    ? snapToNextWorkingTime(new Date(settings.projectStartDate), settings)
    : snapToNextWorkingTime(new Date(), settings);

  // Map to hold intermediate forward results
  interface TaskCalcState {
    earlyStart: Date;
    earlyFinish: Date;
    totalPlannedDurationMinutes: number;
    setupMinutesApplied: number;
    takedownMinutesApplied: number;
    netWorkRemainingMinutes: number;
  }

  const calcState = new Map<string, TaskCalcState>();

  // FORWARD PASS
  for (const taskId of topoOrder) {
    const task = taskMap.get(taskId)!;

    // 1. Calculate effective duration with setup and takedown buffers
    const completedWork = task.completedWorkMinutes || 0;
    const netWork = Math.max(0, task.baseDurationMinutes - completedWork);

    let setupApplied = 0;
    let takedownApplied = 0;

    if (task.status === "DONE") {
      setupApplied = 0;
      takedownApplied = 0;
    } else {
      // Setup buffer is needed for initial start or resuming
      setupApplied = task.setupMinutes;
      // Takedown buffer is needed when task finishes or wraps up
      takedownApplied = task.takedownMinutes;
    }

    const totalPlannedDurationMinutes =
      task.status === "DONE"
        ? Math.max(1, completedWork)
        : Math.max(1, setupApplied + netWork + takedownApplied);

    // 2. Determine Early Start (ES)
    let earliestStart = new Date(baseProjectStart);

    // Check predecessor dependencies
    const incomingDeps = reverseAdj.get(taskId) || [];
    for (const dep of incomingDeps) {
      const predState = calcState.get(dep.predecessorId);
      if (!predState) continue;

      let constraintTime: Date;
      if (dep.type === "FS") {
        // Finish to Start: ES >= Pred EF + Lag
        constraintTime = addWorkingMinutes(predState.earlyFinish, dep.lagMinutes, settings);
      } else if (dep.type === "SS") {
        // Start to Start: ES >= Pred ES + Lag
        constraintTime = addWorkingMinutes(predState.earlyStart, dep.lagMinutes, settings);
      } else {
        // Default fallback to pred earlyFinish
        constraintTime = addWorkingMinutes(predState.earlyFinish, dep.lagMinutes, settings);
      }

      if (isAfter(constraintTime, earliestStart)) {
        earliestStart = constraintTime;
      }
    }

    // Apply task constraints
    const pinned = task.pinnedDate ? new Date(task.pinnedDate) : null;

    if (task.constraintType === "MUST_START_ON" && pinned) {
      earliestStart = snapToNextWorkingTime(pinned, settings);
    } else if (task.constraintType === "START_NO_EARLIER_THAN" && pinned) {
      const pinnedSnapped = snapToNextWorkingTime(pinned, settings);
      if (isAfter(pinnedSnapped, earliestStart)) {
        earliestStart = pinnedSnapped;
      }
    }

    // Calculate Early Finish (EF)
    let earlyFinish = addWorkingMinutes(earliestStart, totalPlannedDurationMinutes, settings);

    // Handle MUST_FINISH_ON
    if (task.constraintType === "MUST_FINISH_ON" && pinned) {
      const pinnedFinish = snapToPreviousWorkingTime(pinned, settings);
      earlyFinish = pinnedFinish;
      earliestStart = subtractWorkingMinutes(
        earlyFinish,
        totalPlannedDurationMinutes,
        settings
      );
    }

    // Handle Finish-to-Finish (FF) incoming dependencies
    for (const dep of incomingDeps) {
      if (dep.type === "FF") {
        const predState = calcState.get(dep.predecessorId);
        if (predState) {
          const minFinish = addWorkingMinutes(predState.earlyFinish, dep.lagMinutes, settings);
          if (isAfter(minFinish, earlyFinish)) {
            earlyFinish = minFinish;
            earliestStart = subtractWorkingMinutes(
              earlyFinish,
              totalPlannedDurationMinutes,
              settings
            );
          }
        }
      }
    }

    calcState.set(taskId, {
      earlyStart: earliestStart,
      earlyFinish,
      totalPlannedDurationMinutes,
      setupMinutesApplied: setupApplied,
      takedownMinutesApplied: takedownApplied,
      netWorkRemainingMinutes: netWork,
    });
  }

  // Determine overall project completion date
  let projectEnd = baseProjectStart;
  calcState.forEach((state) => {
    if (isAfter(state.earlyFinish, projectEnd)) {
      projectEnd = state.earlyFinish;
    }
  });

  // BACKWARD PASS
  const lateState = new Map<string, { lateStart: Date; lateFinish: Date }>();

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const taskId = topoOrder[i];
    const task = taskMap.get(taskId)!;
    const forward = calcState.get(taskId)!;

    let latestFinish = new Date(projectEnd);

    // If FINISH_NO_LATER_THAN or MUST_FINISH_ON constraint exists
    if (
      (task.constraintType === "FINISH_NO_LATER_THAN" ||
        task.constraintType === "MUST_FINISH_ON") &&
      task.pinnedDate
    ) {
      const pinnedFinish = snapToPreviousWorkingTime(new Date(task.pinnedDate), settings);
      if (isBefore(pinnedFinish, latestFinish)) {
        latestFinish = pinnedFinish;
      }
    }

    // Check successor constraints
    const outgoingDeps = adj.get(taskId) || [];
    for (const dep of outgoingDeps) {
      const succLate = lateState.get(dep.successorId);
      if (!succLate) continue;

      let maxFinishAllowed: Date;
      if (dep.type === "FS") {
        // Pred LF <= Succ LS - Lag
        maxFinishAllowed = subtractWorkingMinutes(succLate.lateStart, dep.lagMinutes, settings);
      } else if (dep.type === "FF") {
        // Pred LF <= Succ LF - Lag
        maxFinishAllowed = subtractWorkingMinutes(succLate.lateFinish, dep.lagMinutes, settings);
      } else {
        maxFinishAllowed = subtractWorkingMinutes(succLate.lateStart, dep.lagMinutes, settings);
      }

      if (isBefore(maxFinishAllowed, latestFinish)) {
        latestFinish = maxFinishAllowed;
      }
    }

    const lateStart = subtractWorkingMinutes(
      latestFinish,
      forward.totalPlannedDurationMinutes,
      settings
    );

    lateState.set(taskId, {
      lateStart,
      lateFinish: latestFinish,
    });
  }

  // Compile full results and determine Critical Path
  const criticalPathTaskIds: string[] = [];
  const results: ScheduledTaskResult[] = tasks.map((task) => {
    const fwd = calcState.get(task.id)!;
    const bwd = lateState.get(task.id)!;

    // Total Float in working minutes
    const totalFloat = getWorkingMinutesBetween(fwd.earlyStart, bwd.lateStart, settings);
    // Tasks with float <= 15 minutes are considered on the critical path
    const isCritical = totalFloat <= 15 && task.status !== "DONE";

    if (isCritical) {
      criticalPathTaskIds.push(task.id);
    }

    return {
      ...task,
      earlyStart: fwd.earlyStart,
      earlyFinish: fwd.earlyFinish,
      lateStart: bwd.lateStart,
      lateFinish: bwd.lateFinish,
      totalFloatMinutes: totalFloat,
      isCritical,
      totalPlannedDurationMinutes: fwd.totalPlannedDurationMinutes,
      setupMinutesApplied: fwd.setupMinutesApplied,
      takedownMinutesApplied: fwd.takedownMinutesApplied,
      netWorkRemainingMinutes: fwd.netWorkRemainingMinutes,
      scheduledStart: fwd.earlyStart,
      scheduledEnd: fwd.earlyFinish,
    };
  });

  return {
    tasks: results,
    projectStart: baseProjectStart,
    projectEnd,
    criticalPathTaskIds,
    hasCycle,
  };
}
