import { route, readJson, created } from "@/lib/api";
import { taskCreateSchema } from "@/lib/validation";
import { createTask } from "@/lib/services/tasks";
import { getSchedule } from "@/lib/services/schedule";

export const GET = route(async () => {
  const { tasks, dependencies, settings, scheduleOverview } = await getSchedule();
  return { tasks, dependencies, settings, scheduleOverview };
});

export const POST = route(async (req) => {
  return created(await createTask(await readJson(req, taskCreateSchema)));
});
