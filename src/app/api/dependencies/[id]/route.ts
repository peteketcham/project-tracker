import { prisma } from "@/lib/prisma";
import { route, type IdParams } from "@/lib/api";

export const DELETE = route<IdParams>(async (_req, { params }) => {
  const { id } = await params;
  await prisma.taskDependency.delete({ where: { id } });
  return { success: true, id };
});
