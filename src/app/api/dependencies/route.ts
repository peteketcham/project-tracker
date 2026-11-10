import { route, readJson, created } from "@/lib/api";
import { dependencySchema } from "@/lib/validation";
import { addDependency } from "@/lib/services/tasks";

export const POST = route(async (req) => {
  return created(await addDependency(await readJson(req, dependencySchema)));
});
