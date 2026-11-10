import { route, readJson, created } from "@/lib/api";
import { decomposeRequestSchema } from "@/lib/validation";
import { decompose, decomposeMode } from "@/lib/services/decompose";

/** Tells the UI whether a model is configured, so it can label the feature honestly. */
export const GET = route(async () => decomposeMode());

export const POST = route(async (req) => {
  const { prompt, targetDays } = await readJson(req, decomposeRequestSchema);
  return created(await decompose(prompt, targetDays));
});
