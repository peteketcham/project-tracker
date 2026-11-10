import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import { prisma } from "../lib/prisma";
import { describeError } from "../lib/errors";
import { getSchedule, runWhatIf } from "../lib/services/schedule";
import { getInsights } from "../lib/services/insights";
import { addTimeOff, listTimeOff } from "../lib/services/calendar";
import {
  addDependency,
  createPlan,
  createTask,
  deleteTask,
  removeDependency,
  removeDependencyBetween,
  transitionTask,
  updateTask,
} from "../lib/services/tasks";
import {
  CONSTRAINT_TYPES,
  SESSION_ACTIONS,
  dependencyObject,
  dependencySchema,
  idSchema,
  planObject,
  planSchema,
  sessionActionSchema,
  taskCreateObject,
  taskCreateSchema,
  taskUpdateObject,
  taskUpdateSchema,
  timeOffObject,
  timeOffSchema,
  whatIfObject,
  whatIfSchema,
} from "../lib/validation";

/**
 * MCP door into the tracker. Every tool validates with the shared schemas and
 * calls the shared services, so agents are held to the same rules as the UI.
 */

const server = new McpServer({ name: "project-tracker-mcp", version: "1.2.0" });

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/** Registers a tool whose handler returns text or JSON-able data; errors become safe messages. */
function tool(
  name: string,
  description: string,
  shape: ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<unknown>
) {
  server.tool(name, description, shape, async (args): Promise<ToolResult> => {
    try {
      const result = await handler(args as Record<string, unknown>);
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      const { body } = describeError(error);
      return { content: [{ type: "text", text: JSON.stringify(body) }], isError: true };
    }
  });
}

tool(
  "list_tasks",
  "Lists all tasks with durations, constraints, statuses and dependency links",
  {},
  async () =>
    prisma.task.findMany({
      orderBy: { order: "asc" },
      include: { dependenciesAsSuccessor: true, dependenciesAsPredecessor: true },
    })
);

tool(
  "create_task",
  "Creates a task (in BACKLOG or SCHEDULED) with focused-work minutes, setup/takedown buffers and an optional date constraint",
  taskCreateObject.shape,
  async (args) => {
    const task = await createTask(taskCreateSchema.parse(args));
    return `Created task "${task.title}" (ID: ${task.id}): ${task.baseDurationMinutes}m work, +${task.setupMinutes}m setup, +${task.takedownMinutes}m takedown.`;
  }
);

tool(
  "bulk_decompose_project",
  "Creates several tasks and the dependencies between them in one all-or-nothing batch. Tasks are linked by tempKey.",
  planObject.shape,
  async (args) => {
    const { tasks, dependencyCount, keyToId } = await createPlan(planSchema.parse(args));
    return {
      message: `Created ${tasks.length} tasks and ${dependencyCount} dependencies.`,
      taskIds: keyToId,
    };
  }
);

tool(
  "add_dependency",
  "Links two tasks (FS, SS, FF or SF) with optional lag (positive) or lead (negative) in working minutes. Refuses links that would create a cycle.",
  dependencyObject.shape,
  async (args) => {
    const dep = await addDependency(dependencySchema.parse(args));
    return `Added ${dep.type} dependency ${dep.predecessorId} -> ${dep.successorId} (lag: ${dep.lagMinutes}m).`;
  }
);

tool(
  "pin_task",
  "Sets a task's scheduling constraint. Dated constraints (MUST_START_ON, MUST_FINISH_ON, START_NO_EARLIER_THAN, FINISH_NO_LATER_THAN) need pinnedDate; ASAP/ALAP clear it.",
  {
    taskId: idSchema,
    constraintType: z.enum(CONSTRAINT_TYPES),
    pinnedDate: z.string().optional().describe("ISO date-time"),
  },
  async (args) => {
    const { taskId, constraintType, pinnedDate } = args as {
      taskId: string;
      constraintType: string;
      pinnedDate?: string;
    };
    const task = await updateTask(
      taskId,
      taskUpdateSchema.parse({ constraintType, pinnedDate: pinnedDate ?? null })
    );
    return `Task "${task.title}" constraint set to ${task.constraintType}${
      task.pinnedDate ? ` at ${task.pinnedDate.toISOString()}` : ""
    }.`;
  }
);

tool(
  "get_schedule_summary",
  "Computes the schedule: project start/end, critical tasks, and each task's dates and float",
  {},
  async () => {
    const { schedule } = await getSchedule();
    return {
      projectStart: schedule.projectStart.toISOString(),
      projectEnd: schedule.projectEnd.toISOString(),
      hasCycle: schedule.hasCycle,
      conflicts: schedule.conflicts,
      criticalPathCount: schedule.criticalPathTaskIds.length,
      tasks: schedule.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        start: t.earlyStart.toISOString(),
        finish: t.earlyFinish.toISOString(),
        floatMinutes: t.totalFloatMinutes,
        isCritical: t.isCritical,
        remainingAttendedMinutes: t.totalPlannedDurationMinutes,
        unattendedMinutes: t.unattendedMinutesApplied,
        effectiveDurationMinutes: t.effectiveDurationMinutes,
        interruptionOverheadMinutes: t.overheadMinutes,
        assignee: t.assignee ?? null,
      })),
    };
  }
);

tool(
  "track_work_session",
  "Starts, pauses (logging an interruption and its takedown), resumes (adding setup) or completes a task. Invalid moves are refused.",
  {
    taskId: idSchema,
    action: z.enum(SESSION_ACTIONS),
    reason: z.string().optional().describe("Why the task was interrupted, when pausing"),
    elapsedMinutes: z
      .number()
      .optional()
      .describe("Overrides the measured length of the current work session"),
  },
  async (args) => {
    const { taskId, action, reason, elapsedMinutes } = sessionActionSchema.parse(args);
    const task = await transitionTask(taskId, action, { reason, elapsedMinutes });
    return `Task "${task.title}" is now ${task.status}.`;
  }
);

tool(
  "update_task",
  "Changes fields of a task. Setting status moves it through the state machine (invalid moves are refused).",
  { taskId: idSchema, ...taskUpdateObject.shape },
  async (args) => {
    const { taskId, ...fields } = args as { taskId: string };
    const task = await updateTask(taskId, taskUpdateSchema.parse(fields));
    return `Updated task "${task.title}" (${task.status}).`;
  }
);

tool(
  "delete_task",
  "Permanently deletes a task with its dependencies, sessions and interruption log. Cannot be undone.",
  { taskId: idSchema },
  async (args) => {
    await deleteTask(idSchema.parse(args.taskId));
    return "Task deleted.";
  }
);

tool(
  "remove_dependency",
  "Removes a dependency, by its id or by the pair of task ids it links",
  {
    dependencyId: idSchema.optional(),
    predecessorId: idSchema.optional(),
    successorId: idSchema.optional(),
  },
  async (args) => {
    const { dependencyId, predecessorId, successorId } = z
      .object({
        dependencyId: idSchema.optional(),
        predecessorId: idSchema.optional(),
        successorId: idSchema.optional(),
      })
      .refine((v) => Boolean(v.dependencyId) !== Boolean(v.predecessorId && v.successorId), {
        message: "Give dependencyId, or both predecessorId and successorId",
      })
      .parse(args);
    if (dependencyId) await removeDependency(dependencyId);
    else await removeDependencyBetween(predecessorId!, successorId!);
    return "Dependency removed.";
  }
);

tool(
  "what_if",
  "Tries a hypothetical change (interrupt the running task, extend a task, take time off, drop a task) and reports which tasks slip and by how many working minutes. Saves nothing.",
  whatIfObject.shape,
  async (args) => runWhatIf(whatIfSchema.parse(args))
);

tool(
  "list_time_off",
  "Lists upcoming time off and imported busy blocks (non-working time)",
  {},
  async () => listTimeOff()
);

tool(
  "add_time_off",
  "Blocks out a period as non-working time; the schedule moves around it",
  timeOffObject.shape,
  async (args) => {
    const t = await addTimeOff(timeOffSchema.parse(args));
    return `Blocked out "${t.title}" from ${t.start.toISOString()} to ${t.end.toISOString()}.`;
  }
);

tool(
  "get_insights",
  "Reports what logged sessions show: interruption counts and overhead by reason and week, average focus stretch, and estimated vs actual focused work",
  {},
  async () => getInsights()
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Project Tracker MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error in MCP Server:", error);
  process.exit(1);
});
