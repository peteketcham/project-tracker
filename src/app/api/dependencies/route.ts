import { prisma } from "@/lib/prisma";
import { route, readJson, created } from "@/lib/api";
import { dependencySchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const { predecessorId, successorId, type, lagMinutes } = await readJson(req, dependencySchema);

  const dep = await prisma.taskDependency.upsert({
    where: { predecessorId_successorId: { predecessorId, successorId } },
    update: { type, lagMinutes },
    create: { predecessorId, successorId, type, lagMinutes },
  });

  return created(dep);
});
