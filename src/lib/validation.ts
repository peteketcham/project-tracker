import { z } from "zod";

/**
 * Single source of truth for input validation. Used by the REST routes and the
 * MCP server so both doors enforce the same rules (constitution, principle III).
 */

export const TASK_STATUSES = ["BACKLOG", "SCHEDULED", "IN_PROGRESS", "PAUSED", "DONE"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const CONSTRAINT_TYPES = [
  "ASAP",
  "ALAP",
  "MUST_START_ON",
  "MUST_FINISH_ON",
  "START_NO_EARLIER_THAN",
  "FINISH_NO_LATER_THAN",
] as const;
export const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;
export const SESSION_ACTIONS = ["START", "PAUSE", "RESUME", "COMPLETE"] as const;

/** Constraints that are meaningless without a date. */
export const DATED_CONSTRAINTS: readonly string[] = [
  "MUST_START_ON",
  "MUST_FINISH_ON",
  "START_NO_EARLIER_THAN",
  "FINISH_NO_LATER_THAN",
];

const MAX_MINUTES = 60 * 24 * 365; // one year

export const idSchema = z.string().trim().min(1).max(64);

export const minutesSchema = z.coerce
  .number({ error: "Must be a number of minutes" })
  .int("Must be a whole number of minutes")
  .min(0, "Cannot be negative")
  .max(MAX_MINUTES, "Too large");

export const dateSchema = z
  .union([z.string().trim().min(1), z.date()])
  .transform((value, ctx) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Not a valid date/time" });
      return z.NEVER;
    }
    return d;
  });

/** Accepts a date, or null / "" to clear it. */
export const nullableDateSchema = z
  .union([z.null(), z.literal("").transform(() => null), dateSchema])
  .optional();

export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #3b82f6");

const taskFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES),
  baseDurationMinutes: minutesSchema.min(1, "Must be at least 1 minute"),
  setupMinutes: minutesSchema,
  takedownMinutes: minutesSchema,
  unattendedMinutes: minutesSchema,
  assignee: z
    .union([z.null(), z.string().trim().max(60)])
    .transform((v) => (v ? v : null))
    .optional(),
  constraintType: z.enum(CONSTRAINT_TYPES),
  pinnedDate: nullableDateSchema,
  color: colorSchema,
};

function requirePinnedDate(
  value: { constraintType?: string; pinnedDate?: Date | null },
  ctx: z.RefinementCtx
) {
  if (
    value.constraintType &&
    DATED_CONSTRAINTS.includes(value.constraintType) &&
    value.pinnedDate === null
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["pinnedDate"],
      message: `${value.constraintType} needs a date`,
    });
  }
}

/** New tasks may only start in BACKLOG or SCHEDULED; other states are reached by transitions. */
export const taskCreateObject = z.object({
  title: taskFields.title.default("Untitled Task"),
  description: taskFields.description,
  status: z.enum(["BACKLOG", "SCHEDULED"]).default("SCHEDULED"),
  priority: taskFields.priority.default("MEDIUM"),
  baseDurationMinutes: taskFields.baseDurationMinutes.default(60),
  setupMinutes: taskFields.setupMinutes.default(15),
  takedownMinutes: taskFields.takedownMinutes.default(10),
  unattendedMinutes: taskFields.unattendedMinutes.default(0),
  assignee: taskFields.assignee,
  constraintType: taskFields.constraintType.default("ASAP"),
  pinnedDate: taskFields.pinnedDate,
  color: taskFields.color.default("#3b82f6"),
});

export const taskCreateSchema = taskCreateObject.superRefine((v, ctx) => {
  if (DATED_CONSTRAINTS.includes(v.constraintType) && !v.pinnedDate) {
    ctx.addIssue({
      code: "custom",
      path: ["pinnedDate"],
      message: `${v.constraintType} needs a date`,
    });
  }
});

export const taskUpdateObject = z.object({
  title: taskFields.title.optional(),
  description: taskFields.description,
  status: z.enum(TASK_STATUSES).optional(),
  priority: taskFields.priority.optional(),
  baseDurationMinutes: taskFields.baseDurationMinutes.optional(),
  setupMinutes: taskFields.setupMinutes.optional(),
  takedownMinutes: taskFields.takedownMinutes.optional(),
  unattendedMinutes: taskFields.unattendedMinutes.optional(),
  assignee: taskFields.assignee,
  constraintType: taskFields.constraintType.optional(),
  pinnedDate: taskFields.pinnedDate,
  color: taskFields.color.optional(),
  order: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const taskUpdateSchema = taskUpdateObject.superRefine(requirePinnedDate);

export const dependencyObject = z.object({
  predecessorId: idSchema,
  successorId: idSchema,
  type: z.enum(DEPENDENCY_TYPES).default("FS"),
  /** Positive = lag (wait), negative = lead (overlap). Working minutes. */
  lagMinutes: z.coerce.number().int().min(-MAX_MINUTES).max(MAX_MINUTES).default(0),
});

export const dependencySchema = dependencyObject.refine(
  (v) => v.predecessorId !== v.successorId,
  { message: "A task cannot depend on itself", path: ["successorId"] }
);

export const sessionActionSchema = z.object({
  taskId: idSchema,
  action: z.enum(SESSION_ACTIONS),
  reason: z.string().trim().max(500).optional(),
  elapsedMinutes: minutesSchema.optional(),
});

export const decomposeRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Describe the project or activity").max(2000),
  targetDays: z.coerce.number().int().min(1).max(365).optional(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type DependencyInput = z.infer<typeof dependencySchema>;
export type SessionActionInput = z.infer<typeof sessionActionSchema>;

/** A batch of new tasks linked by temporary keys (used by MCP and Decompose). */
export const planObject = z.object({
  tasks: z
    .array(taskCreateObject.extend({ tempKey: z.string().trim().min(1).max(32) }))
    .min(1)
    .max(50),
  dependencies: z
    .array(
      z.object({
        predecessorKey: z.string().trim().min(1).max(32),
        successorKey: z.string().trim().min(1).max(32),
        type: z.enum(DEPENDENCY_TYPES).default("FS"),
        lagMinutes: dependencyObject.shape.lagMinutes,
      })
    )
    .max(200)
    .default([]),
});

export const planSchema = planObject.superRefine((plan, ctx) => {
  const keys = new Set<string>();
  plan.tasks.forEach((t, i) => {
    if (keys.has(t.tempKey)) {
      ctx.addIssue({ code: "custom", path: ["tasks", i, "tempKey"], message: "Duplicate tempKey" });
    }
    keys.add(t.tempKey);
    if (DATED_CONSTRAINTS.includes(t.constraintType) && !t.pinnedDate) {
      ctx.addIssue({
        code: "custom",
        path: ["tasks", i, "pinnedDate"],
        message: `${t.constraintType} needs a date`,
      });
    }
  });
  plan.dependencies.forEach((d, i) => {
    for (const field of ["predecessorKey", "successorKey"] as const) {
      if (!keys.has(d[field])) {
        ctx.addIssue({
          code: "custom",
          path: ["dependencies", i, field],
          message: `Unknown task key "${d[field]}"`,
        });
      }
    }
    if (d.predecessorKey === d.successorKey) {
      ctx.addIssue({
        code: "custom",
        path: ["dependencies", i, "successorKey"],
        message: "A task cannot depend on itself",
      });
    }
  });
});

export type PlanInput = z.infer<typeof planSchema>;

/* ------------------------------------------------- settings and time off */

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Use 24-hour HH:MM");

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsUpdateSchema = z
  .object({
    workingHoursStart: timeOfDay,
    workingHoursEnd: timeOfDay,
    workDays: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "Pick at least one working day")
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    timezone: z
      .union([z.null(), z.literal("").transform(() => null), z.string().refine(isTimeZone, "Unknown time zone")])
      .optional(),
    levelResources: z.boolean().optional(),
    projectStartDate: nullableDateSchema,
  })
  .refine((v) => toMinutes(v.workingHoursEnd) > toMinutes(v.workingHoursStart), {
    path: ["workingHoursEnd"],
    message: "Working hours must end after they start",
  });

export const timeOffObject = z.object({
  title: z.string().trim().min(1, "Give it a name").max(200),
  start: dateSchema,
  end: dateSchema,
});

export const timeOffSchema = timeOffObject.refine((v) => v.end > v.start, {
  path: ["end"],
  message: "Must end after it starts",
});

export const icsImportSchema = z
  .object({
    /** Contents of an .ics file. */
    ics: z.string().max(2_000_000).optional(),
    /** Address of an .ics feed (http, https or webcal). Fetched once, not stored. */
    url: z.string().trim().max(2000).optional(),
    /** Use the ICS_URL configured in the server environment. */
    useConfigured: z.boolean().optional(),
  })
  .refine((v) => [v.ics, v.url, v.useConfigured].filter(Boolean).length === 1, {
    message: "Provide exactly one of: ics, url, useConfigured",
  });

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type TimeOffInput = z.infer<typeof timeOffSchema>;
