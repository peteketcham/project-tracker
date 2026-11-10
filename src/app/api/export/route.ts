import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { exportAll } from "@/lib/services/backup";

export const GET = route(async () => {
  const data = await exportAll();
  const stamp = data.exportedAt.toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="project-tracker-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
