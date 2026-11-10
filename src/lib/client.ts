import type { KanbanTask } from "@/components/KanbanBoard";

/** Shapes returned by the REST API, as seen by the browser (dates are ISO strings). */

export interface DependencyDTO {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagMinutes: number;
}

export interface SettingsDTO {
  workingHoursStart: string;
  workingHoursEnd: string;
  workDays: string;
  projectStartDate: string | null;
  levelResources: boolean;
  timezone: string | null;
}

export interface ConflictDTO {
  taskId: string;
  type: string;
  message: string;
  minutes?: number;
}

export interface ScheduleOverview {
  projectStart: string;
  projectEnd: string;
  now: string;
  criticalPathTaskIds: string[];
  hasCycle: boolean;
  conflicts: ConflictDTO[];
}

export interface ScheduleResponse {
  tasks: KanbanTask[];
  dependencies: DependencyDTO[];
  settings: SettingsDTO;
  scheduleOverview: ScheduleOverview;
}

export interface NewDependency {
  predecessorId: string;
  type: string;
  lagMinutes: number;
}

interface ErrorBody {
  error?: string;
  issues?: Array<{ field: string; message: string }>;
}

/** fetch wrapper: sends JSON, and turns non-2xx responses into Errors with a readable message. */
export async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data ?? {}) as ErrorBody;
    const issues = err.issues?.map((i) => `${i.field}: ${i.message}`).join("; ");
    throw new Error([err.error ?? `Request failed (${res.status})`, issues].filter(Boolean).join(" — "));
  }
  return data as T;
}
