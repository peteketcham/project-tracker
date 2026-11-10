import { route, type IdParams } from "@/lib/api";
import { removeDependency } from "@/lib/services/tasks";

export const DELETE = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  return removeDependency(id);
});
