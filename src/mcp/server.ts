import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import { prisma } from "../lib/prisma";
import { describeError } from "../lib/errors";
import { getSchedule } from "../lib/services/schedule";
import {
  addDependency,
  createPlan,
  createTask,
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
  taskUpdateSchema,
} from "../lib/validation";

/**
 * MCP door into the tracker. Every tool validates with the shared schemas and
 * calls the shared services, so agents are held to the same rules as the UI.
 */

const server = new McpServer({ name: "project-tracker-mcp", version: "1.1.0" });

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
      criticalPathCount: schedule.criticalPathTaskIds.length,
      tasks: schedule.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        start: t.earlyStart.toISOString(),
        finish: t.earlyFinish.toISOString(),
        floatMinutes: t.totalFloatMinutes,
        isCritical: t.isCritical,
        remainingPlannedMinutes: t.totalPlannedDurationMinutes,
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

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Project Tracker MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error in MCP Server:", error);
  process.exit(1);
});
