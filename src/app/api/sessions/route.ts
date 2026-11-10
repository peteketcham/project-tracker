import { route, readJson } from "@/lib/api";
import { sessionActionSchema } from "@/lib/validation";
import { transitionTask } from "@/lib/services/tasks";

export const POST = route(async (req) => {
  const { taskId, action, reason, elapsedMinutes } = await readJson(req, sessionActionSchema);
  const task = await transitionTask(taskId, action, { reason, elapsedMinutes });
  return { success: true, task, action };
});
