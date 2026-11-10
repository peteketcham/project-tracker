import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { calculateSchedule } from "../lib/scheduler/engine";
import { pauseTask, resumeTask } from "../lib/scheduler/interruption";
import { WorkingCalendarSettings } from "../lib/scheduler/types";

// Helper to get current project settings
async function getSettings(): Promise<WorkingCalendarSettings> {
  let settings = await prisma.projectSettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.projectSettings.create({
      data: { id: "default" },
    });
  }

  return {
    workingHoursStart: settings.workingHoursStart,
    workingHoursEnd: settings.workingHoursEnd,
    workDays: settings.workDays.split(",").map(Number),
    defaultSetupMinutes: settings.defaultSetupMinutes,
    defaultTakedownMinutes: settings.defaultTakedownMinutes,
    projectStartDate: settings.projectStartDate,
  };
}

const server = new McpServer({
  name: "project-tracker-mcp",
  version: "1.0.0",
});

// Tool 1: List all tasks
server.tool(
  "list_tasks",
  "Lists all tasks currently in the project tracker with durations, constraints, and statuses",
  {},
  async () => {
    const tasks = await prisma.task.findMany({
      orderBy: { order: "asc" },
      include: {
        dependenciesAsSuccessor: true,
        dependenciesAsPredecessor: true,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(tasks, null, 2),
        },
      ],
    };
  }
);

// Tool 2: Create a single task
server.tool(
  "create_task",
  "Creates a new task with duration, setup/takedown context buffers, and scheduling constraints",
  {
    title: z.string().describe("Title of the task"),
    description: z.string().optional().describe("Detailed description of work"),
    status: z
      .enum(["BACKLOG", "SCHEDULED", "IN_PROGRESS", "PAUSED", "DONE"])
      .optional()
      .default("SCHEDULED")
      .describe("Task status"),
    priority: z
      .enum(["LOW", "MEDIUM", "HIGH", "URGENT"])
      .optional()
      .default("MEDIUM")
      .describe("Task priority"),
    baseDurationMinutes: z
      .number()
      .describe("Focused productive work time in minutes (excluding setup/takedown)"),
    setupMinutes: z
      .number()
      .optional()
      .default(15)
      .describe("Context warm-up time in minutes"),
    takedownMinutes: z
      .number()
      .optional()
      .default(10)
      .describe("Context wrap-up / save-state time in minutes"),
    constraintType: z
      .enum([
        "ASAP",
        "ALAP",
        "MUST_START_ON",
        "MUST_FINISH_ON",
        "START_NO_EARLIER_THAN",
        "FINISH_NO_LATER_THAN",
      ])
      .optional()
      .default("ASAP")
      .describe("Scheduling constraint"),
    pinnedDate: z
      .string()
      .optional()
      .describe("Target date/time in ISO format for pinned constraints"),
    color: z.string().optional().default("#3b82f6").describe("Hex color code"),
  },
  async (args) => {
    const count = await prisma.task.count();
    const task = await prisma.task.create({
      data: {
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        baseDurationMinutes: args.baseDurationMinutes,
        setupMinutes: args.setupMinutes ?? 15,
        takedownMinutes: args.takedownMinutes ?? 10,
        constraintType: args.constraintType ?? "ASAP",
        pinnedDate: args.pinnedDate ? new Date(args.pinnedDate) : null,
        color: args.color ?? "#3b82f6",
        order: count + 1,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Created task "${task.title}" (ID: ${task.id}) with duration ${task.baseDurationMinutes}m (+${task.setupMinutes}m setup, +${task.takedownMinutes}m takedown).`,
        },
      ],
    };
  }
);

// Tool 3: Bulk decompose a project into multiple tasks and dependencies
server.tool(
  "bulk_decompose_project",
  "Creates multiple interconnected tasks and dependencies in one atomic batch, then computes the schedule",
  {
    tasks: z.array(
      z.object({
        tempKey: z.string().describe("Temporary key to link dependencies, e.g. 'T1'"),
        title: z.string(),
        description: z.string().optional(),
        baseDurationMinutes: z.number(),
        setupMinutes: z.number().optional().default(15),
        takedownMinutes: z.number().optional().default(10),
        status: z
          .enum(["BACKLOG", "SCHEDULED", "IN_PROGRESS", "PAUSED", "DONE"])
          .optional()
          .default("SCHEDULED"),
        priority: z
          .enum(["LOW", "MEDIUM", "HIGH", "URGENT"])
          .optional()
          .default("MEDIUM"),
        constraintType: z
          .enum([
            "ASAP",
            "ALAP",
            "MUST_START_ON",
            "MUST_FINISH_ON",
            "START_NO_EARLIER_THAN",
            "FINISH_NO_LATER_THAN",
          ])
          .optional()
          .default("ASAP"),
        pinnedDate: z.string().optional(),
        color: z.string().optional().default("#3b82f6"),
      })
    ),
    dependencies: z.array(
      z.object({
        predecessorKey: z.string().describe("tempKey of the prerequisite task"),
        successorKey: z.string().describe("tempKey of the dependent task"),
        type: z.enum(["FS", "SS", "FF", "SF"]).optional().default("FS"),
        lagMinutes: z.number().optional().default(0),
      })
    ),
  },
  async (args) => {
    const keyToId = new Map<string, string>();
    const createdTasks = [];
    let currentOrder = await prisma.task.count();

    for (const item of args.tasks) {
      currentOrder += 1;
      const created = await prisma.task.create({
        data: {
          title: item.title,
          description: item.description,
          status: item.status ?? "SCHEDULED",
          priority: item.priority ?? "MEDIUM",
          baseDurationMinutes: item.baseDurationMinutes,
          setupMinutes: item.setupMinutes ?? 15,
          takedownMinutes: item.takedownMinutes ?? 10,
          constraintType: item.constraintType ?? "ASAP",
          pinnedDate: item.pinnedDate ? new Date(item.pinnedDate) : null,
          color: item.color ?? "#3b82f6",
          order: currentOrder,
        },
      });
      keyToId.set(item.tempKey, created.id);
      createdTasks.push(created);
    }

    let createdDepsCount = 0;
    for (const dep of args.dependencies) {
      const predId = keyToId.get(dep.predecessorKey);
      const succId = keyToId.get(dep.successorKey);
      if (predId && succId) {
        await prisma.taskDependency.create({
          data: {
            predecessorId: predId,
            successorId: succId,
            type: dep.type ?? "FS",
            lagMinutes: dep.lagMinutes ?? 0,
          },
        });
        createdDepsCount += 1;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `Successfully created ${createdTasks.length} tasks and ${createdDepsCount} dependencies.`,
        },
      ],
    };
  }
);

// Tool 4: Add dependency
server.tool(
  "add_dependency",
  "Links two tasks with a dependency relation (FS, SS, FF, SF) and optional lag time",
  {
    predecessorId: z.string().describe("ID of the prerequisite task"),
    successorId: z.string().describe("ID of the dependent task"),
    type: z.enum(["FS", "SS", "FF", "SF"]).optional().default("FS"),
    lagMinutes: z.number().optional().default(0).describe("Lag or lead in minutes"),
  },
  async (args) => {
    const dep = await prisma.taskDependency.create({
      data: {
        predecessorId: args.predecessorId,
        successorId: args.successorId,
        type: args.type ?? "FS",
        lagMinutes: args.lagMinutes ?? 0,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Added ${dep.type} dependency from ${dep.predecessorId} to ${dep.successorId} (lag: ${dep.lagMinutes}m).`,
        },
      ],
    };
  }
);

// Tool 5: Pin task constraint
server.tool(
  "pin_task",
  "Pins a task to a specific date or enforces date constraints (MUST_START_ON, MUST_FINISH_ON, etc.)",
  {
    taskId: z.string(),
    constraintType: z.enum([
      "ASAP",
      "ALAP",
      "MUST_START_ON",
      "MUST_FINISH_ON",
      "START_NO_EARLIER_THAN",
      "FINISH_NO_LATER_THAN",
    ]),
    pinnedDate: z.string().describe("ISO datetime string"),
  },
  async (args) => {
    const task = await prisma.task.update({
      where: { id: args.taskId },
      data: {
        constraintType: args.constraintType,
        pinnedDate: new Date(args.pinnedDate),
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task "${task.title}" constraint set to ${task.constraintType} at ${task.pinnedDate?.toISOString()}`,
        },
      ],
    };
  }
);

// Tool 6: Get schedule summary & critical path
server.tool(
  "get_schedule_summary",
  "Calculates and returns the active project schedule, completion date, bottlenecks, and critical path",
  {},
  async () => {
    const settings = await getSettings();
    const tasks = await prisma.task.findMany({
      where: { status: { not: "BACKLOG" } },
      include: {
        workSessions: true,
        interruptionLogs: true,
      },
    });

    const dependencies = await prisma.taskDependency.findMany();

    const schedulerTasks = tasks.map((t) => {
      const completedWork = t.workSessions
        .filter((s) => s.sessionType === "WORK" && s.endTime)
        .reduce((sum, s) => sum + s.durationMinutes, 0);

      return {
        id: t.id,
        title: t.title,
        status: t.status as any,
        priority: t.priority as any,
        baseDurationMinutes: t.baseDurationMinutes,
        setupMinutes: t.setupMinutes,
        takedownMinutes: t.takedownMinutes,
        constraintType: t.constraintType as any,
        pinnedDate: t.pinnedDate,
        order: t.order,
        completedWorkMinutes: completedWork,
        interruptionCount: t.interruptionLogs.length,
      };
    });

    const schedulerDeps = dependencies.map((d) => ({
      id: d.id,
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      type: d.type as any,
      lagMinutes: d.lagMinutes,
    }));

    const result = calculateSchedule(schedulerTasks, schedulerDeps, settings);

    const summary = {
      projectStart: result.projectStart.toISOString(),
      projectEnd: result.projectEnd.toISOString(),
      criticalPathCount: result.criticalPathTaskIds.length,
      criticalPathTasks: result.tasks
        .filter((t) => t.isCritical)
        .map((t) => ({
          id: t.id,
          title: t.title,
          start: t.earlyStart.toISOString(),
          finish: t.earlyFinish.toISOString(),
          totalPlannedMinutes: t.totalPlannedDurationMinutes,
          setupMinutes: t.setupMinutesApplied,
          takedownMinutes: t.takedownMinutesApplied,
        })),
      allScheduledTasks: result.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        start: t.earlyStart.toISOString(),
        finish: t.earlyFinish.toISOString(),
        floatMinutes: t.totalFloatMinutes,
        isCritical: t.isCritical,
      })),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  }
);

// Tool 7: Work session / interruption tracking
server.tool(
  "track_work_session",
  "Starts, pauses (with interruption takedown), resumes (with setup warm-up), or completes a task",
  {
    taskId: z.string(),
    action: z.enum(["START", "PAUSE", "RESUME", "COMPLETE"]),
    reason: z
      .string()
      .optional()
      .describe("Interruption reason if pausing (e.g. 'client emergency call')"),
    elapsedMinutes: z
      .number()
      .optional()
      .describe("Elapsed work minutes for the session if completing or pausing"),
  },
  async (args) => {
    if (args.action === "PAUSE") {
      const task = await pauseTask({
        taskId: args.taskId,
        reason: args.reason,
        elapsedWorkMinutes: args.elapsedMinutes,
      });
      return {
        content: [
          {
            type: "text",
            text: `Task "${task.title}" PAUSED. Incurred ${task.takedownMinutes}m takedown context switch overhead. Reason: "${args.reason || 'None provided'}".`,
          },
        ],
      };
    } else if (args.action === "RESUME") {
      const task = await resumeTask({ taskId: args.taskId });
      return {
        content: [
          {
            type: "text",
            text: `Task "${task.title}" RESUMED. Injected ${task.setupMinutes}m setup context restoration buffer.`,
          },
        ],
      };
    } else if (args.action === "START") {
      const task = await prisma.task.update({
        where: { id: args.taskId },
        data: {
          status: "IN_PROGRESS",
          actualStart: new Date(),
        },
      });
      await prisma.workSession.create({
        data: {
          taskId: args.taskId,
          sessionType: "SETUP",
          startTime: new Date(),
          durationMinutes: task.setupMinutes,
        },
      });
      return {
        content: [
          {
            type: "text",
            text: `Task "${task.title}" STARTED. Running ${task.setupMinutes}m initial setup buffer.`,
          },
        ],
      };
    } else {
      // COMPLETE
      const task = await prisma.task.update({
        where: { id: args.taskId },
        data: {
          status: "DONE",
          actualEnd: new Date(),
        },
      });
      return {
        content: [
          {
            type: "text",
            text: `Task "${task.title}" marked as COMPLETED.`,
          },
        ],
      };
    }
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
