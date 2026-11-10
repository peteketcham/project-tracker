import { route, type IdParams } from "@/lib/api";
import { removeTimeOff } from "@/lib/services/calendar";

export const DELETE = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  return removeTimeOff(id);
});
