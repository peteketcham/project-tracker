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
  status: TaskStatus;
  priority: TaskPriority;
  /** Focused, attended work in working minutes. */
  baseDurationMinutes: number;
  setupMinutes: number;
  takedownMinutes: number;
  /**
   * Waiting time after the attended work and before takedown (oven, curing, a
   * build running). Elapsed clock time, around the clock; the person is free.
   */
  unattendedMinutes?: number;
  /** Whose attention the task needs. Tasks with the same assignee never overlap. */
  assignee?: string | null;
  constraintType: ConstraintType;
  pinnedDate?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  order?: number;
  /** Number of logged interruptions (k). */
  interruptionCount?: number;
  /** Focused minutes already logged in closed work sessions. */
  completedWorkMinutes?: number;
  /** Start of the currently open work session, if the task is running. */
  openWorkSessionStart?: Date | string | null;
}

export interface SchedulerDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Working minutes; negative means lead. */
  lagMinutes: number;
}

export interface BusyBlock {
  start: Date | string;
  end: Date | string;
}

export interface WorkingCalendarSettings {
  workingHoursStart: string; // "09:00"
  workingHoursEnd: string; // "17:00"
  workDays: number[]; // 0 = Sunday ... 6 = Saturday
  /** IANA zone the working hours are expressed in. Defaults to the system zone. */
  timezone?: string | null;
  /** Time that is not available for work: time off, imported calendar events. */
  busy?: BusyBlock[];
  /** Serialize each assignee's attended time (default true). */
  levelResources?: boolean;
  projectStartDate?: Date | string | null;
  defaultSetupMinutes?: number;
  defaultTakedownMinutes?: number;
}

export type ConflictType =
  | "DEPENDENCY_CYCLE"
  | "MUST_START_ON_MISSED"
  | "MUST_FINISH_ON_MISSED"
  | "DEADLINE_MISSED"
  | "MULTIPLE_ACTIVE";

export interface ScheduleConflict {
  taskId: string;
  type: ConflictType;
  message: string;
  /** Size of the miss in working minutes, where that applies. */
  minutes?: number;
}

export interface ScheduledTaskResult extends SchedulerTask {
  earlyStart: Date;
  earlyFinish: Date;
  /** End of the first attended stretch (setup + work). */
  attendedEnd: Date;
  /** Start of takedown; later than attendedEnd when there is unattended time. */
  takedownStart: Date;
  lateStart: Date;
  lateFinish: Date;
  totalFloatMinutes: number;
  isCritical: boolean;
  /** Attended minutes still to do: remaining setup + work + takedown. */
  totalPlannedDurationMinutes: number;
  setupMinutesApplied: number;
  takedownMinutesApplied: number;
  unattendedMinutesApplied: number;
  netWorkRemainingMinutes: number;
  /** (k+1)·S + D + (k+1)·T for k interruptions, plus unattended time. */
  effectiveDurationMinutes: number;
  /** k·(S+T): what the interruptions so far have cost. */
  overheadMinutes: number;
  conflicts: ScheduleConflict[];
}

export interface ScheduleCalculationResult {
  tasks: ScheduledTaskResult[];
  projectStart: Date;
  projectEnd: Date;
  criticalPathTaskIds: string[];
  hasCycle: boolean;
  cycleTaskIds: string[];
  conflicts: ScheduleConflict[];
}
