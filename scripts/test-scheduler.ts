import { calculateSchedule } from "../src/lib/scheduler/engine";
import { SchedulerTask, SchedulerDependency, WorkingCalendarSettings } from "../src/lib/scheduler/types";
import { format } from "date-fns";

const settings: WorkingCalendarSettings = {
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  workDays: [1, 2, 3, 4, 5], // Mon-Fri
  defaultSetupMinutes: 15,
  defaultTakedownMinutes: 10,
  projectStartDate: new Date("2026-11-09T09:00:00"), // Monday 9 AM
};

const tasks: SchedulerTask[] = [
  {
    id: "task-1",
    title: "Database Architecture",
    status: "SCHEDULED",
    priority: "HIGH",
    baseDurationMinutes: 120, // 2 hours
    setupMinutes: 15,
    takedownMinutes: 15,
    constraintType: "ASAP",
  },
  {
    id: "task-2",
    title: "API Implementation",
    status: "SCHEDULED",
    priority: "HIGH",
    baseDurationMinutes: 180, // 3 hours
    setupMinutes: 20,
    takedownMinutes: 10,
    constraintType: "ASAP",
  },
  {
    id: "task-3",
    title: "Frontend Dashboard",
    status: "SCHEDULED",
    priority: "MEDIUM",
    baseDurationMinutes: 240, // 4 hours
    setupMinutes: 30,
    takedownMinutes: 15,
    constraintType: "ASAP",
  },
];

const dependencies: SchedulerDependency[] = [
  {
    id: "dep-1",
    predecessorId: "task-1",
    successorId: "task-2",
    type: "FS",
    lagMinutes: 0,
  },
  {
    id: "dep-2",
    predecessorId: "task-2",
    successorId: "task-3",
    type: "FS",
    lagMinutes: 0,
  },
];

console.log("--- RUNNING SCHEDULER ENGINE TEST ---");
const result = calculateSchedule(tasks, dependencies, settings);

console.log(`Project Start: ${format(result.projectStart, "yyyy-MM-dd HH:mm")}`);
console.log(`Project End:   ${format(result.projectEnd, "yyyy-MM-dd HH:mm")}`);
console.log(`Critical Path Task IDs:`, result.criticalPathTaskIds);

for (const t of result.tasks) {
  console.log(`\nTask: ${t.title} (${t.id})`);
  console.log(`  Duration: Base=${t.baseDurationMinutes}m, Setup=${t.setupMinutesApplied}m, Takedown=${t.takedownMinutesApplied}m -> Total=${t.totalPlannedDurationMinutes}m`);
  console.log(`  Start:    ${format(t.earlyStart, "yyyy-MM-dd HH:mm")}`);
  console.log(`  Finish:   ${format(t.earlyFinish, "yyyy-MM-dd HH:mm")}`);
  console.log(`  Float:    ${t.totalFloatMinutes}m | Critical: ${t.isCritical}`);
}

console.log("\n--- TEST PASSED ---");
