import { route, readJson, created } from "@/lib/api";
import { timeOffSchema } from "@/lib/validation";
import { addTimeOff, listTimeOff } from "@/lib/services/calendar";

export const GET = route(async () => listTimeOff());

export const POST = route(async (req) => created(await addTimeOff(await readJson(req, timeOffSchema))));
