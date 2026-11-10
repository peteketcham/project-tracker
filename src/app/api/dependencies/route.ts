import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { predecessorId, successorId, type = "FS", lagMinutes = 0 } = body;

    if (!predecessorId || !successorId) {
      return NextResponse.json(
        { error: "predecessorId and successorId are required" },
        { status: 400 }
      );
    }

    if (predecessorId === successorId) {
      return NextResponse.json(
        { error: "Cannot create dependency to the same task" },
        { status: 400 }
      );
    }

    // Upsert or create
    const dep = await prisma.taskDependency.upsert({
      where: {
        predecessorId_successorId: {
          predecessorId,
          successorId,
        },
      },
      update: {
        type,
        lagMinutes: Number(lagMinutes) || 0,
      },
      create: {
        predecessorId,
        successorId,
        type,
        lagMinutes: Number(lagMinutes) || 0,
      },
    });

    return NextResponse.json(dep, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create dependency:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
