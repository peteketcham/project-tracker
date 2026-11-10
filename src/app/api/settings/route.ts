import { route, readJson } from "@/lib/api";
import { settingsUpdateSchema } from "@/lib/validation";
import { getSettings, updateSettings } from "@/lib/services/calendar";

export const GET = route(async () => getSettings());

export const PUT = route(async (req) => updateSettings(await readJson(req, settingsUpdateSchema)));
