import { ApiError } from "./errors";
import { findCycleNodes } from "./tasks/graph";
import type { BackupData } from "./validation";

/** Checks that a backup is internally consistent before anything is deleted. */
export function checkBackup(data: BackupData): void {
  const taskIds = new Set(data.tasks.map((t) => t.id));
  if (taskIds.size !== data.tasks.length) throw new ApiError(400, "Backup has duplicate task ids");
  const orphan =
    data.dependencies.find((d) => !taskIds.has(d.predecessorId) || !taskIds.has(d.successorId)) ??
    data.workSessions.find((s) => !taskIds.has(s.taskId)) ??
    data.interruptionLogs.find((l) => !taskIds.has(l.taskId));
  if (orphan) throw new ApiError(400, "Backup refers to a task that is not in it");
  if (findCycleNodes([...taskIds], data.dependencies).length > 0) {
    throw new ApiError(400, "Backup contains a dependency cycle");
  }
}
