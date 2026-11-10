export type TaskStatus = "BACKLOG" | "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "DONE";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ConstraintType =
  | "ASAP"
  | "ALAP"
  | "MUST_START_ON"
  | "MUST_FINISH_ON"
  | "START_NO_EARLIER_THAN"
  | "FINISH_NO_LATER_THAN";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface SchedulerTask {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  baseDurationMinutes: number;
  setupMinutes: number;
  takedownMinutes: number;
  constraintType: ConstraintType;
  pinnedDate?: Date | string | null;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  color?: string;
  order?: number;
  interruptionCount?: number;
  completedWorkMinutes?: number;
}

export interface SchedulerDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagMinutes: number;
}

export interface WorkingCalendarSettings {
  workingHoursStart: string; // e.g. "09:00"
  workingHoursEnd: string;   // e.g. "17:00"
  workDays: number[];        // [1, 2, 3, 4, 5] (Monday=1, Sunday=0)
  defaultSetupMinutes: number;
  defaultTakedownMinutes: number;
  projectStartDate?: Date | string | null;
}

export interface ScheduledTaskResult extends SchedulerTask {
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  totalFloatMinutes: number;
  isCritical: boolean;
  totalPlannedDurationMinutes: number;
  setupMinutesApplied: number;
  takedownMinutesApplied: number;
  netWorkRemainingMinutes: number;
}

export interface ScheduleCalculationResult {
  tasks: ScheduledTaskResult[];
  projectStart: Date;
  projectEnd: Date;
  criticalPathTaskIds: string[];
  hasCycle: boolean;
  cycleTaskIds?: string[];
}
