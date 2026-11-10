import { route, readJson, type IdParams } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";
import { deleteTask, updateTask } from "@/lib/services/tasks";

export const PUT = route<IdParams>(async (req, { params }) => {
  const { id } = await params;
  return updateTask(id, await readJson(req, taskUpdateSchema));
});

export const DELETE = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  return deleteTask(id);
});
