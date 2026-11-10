import { prisma } from "@/lib/prisma";
import { route, readJson, type IdParams } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";

export const PUT = route<IdParams>(async (req, { params }) => {
  const { id } = await params;
  const data = await readJson(req, taskUpdateSchema);
  return prisma.task.update({ where: { id }, data });
});

export const DELETE = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  await prisma.task.delete({ where: { id } });
  return { success: true, id };
});
