import { route, readJson } from "@/lib/api";
import { icsImportSchema } from "@/lib/validation";
import { importIcs } from "@/lib/services/calendar";

export const POST = route(async (req) => importIcs(await readJson(req, icsImportSchema)));
