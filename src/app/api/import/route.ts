import { route, readJson } from "@/lib/api";
import { importRequestSchema } from "@/lib/validation";
import { importAll } from "@/lib/services/backup";

export const POST = route(async (req) => {
  const { data } = await readJson(req, importRequestSchema);
  return { success: true, restored: await importAll(data) };
});
