import { route, readJson, created } from "@/lib/api";
import { baselineCreateSchema } from "@/lib/validation";
import { listBaselines, saveBaseline } from "@/lib/services/baselines";

export const GET = route(async () => listBaselines());

export const POST = route(async (req) => {
  const { name } = await readJson(req, baselineCreateSchema);
  return created(await saveBaseline(name));
});
