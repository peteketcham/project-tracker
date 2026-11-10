import { route, type IdParams } from "@/lib/api";
import { compareBaseline, deleteBaseline } from "@/lib/services/baselines";

/** The baseline compared with the current plan. */
export const GET = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  return compareBaseline(id);
});

export const DELETE = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  return deleteBaseline(id);
});
