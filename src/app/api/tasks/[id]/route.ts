import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const dataToUpdate: any = {};
    if (body.title !== undefined) dataToUpdate.title = body.title;
    if (body.description !== undefined) dataToUpdate.description = body.description;
    if (body.status !== undefined) dataToUpdate.status = body.status;
    if (body.priority !== undefined) dataToUpdate.priority = body.priority;
    if (body.baseDurationMinutes !== undefined)
      dataToUpdate.baseDurationMinutes = Number(body.baseDurationMinutes);
    if (body.setupMinutes !== undefined)
      dataToUpdate.setupMinutes = Number(body.setupMinutes);
    if (body.takedownMinutes !== undefined)
      dataToUpdate.takedownMinutes = Number(body.takedownMinutes);
    if (body.constraintType !== undefined)
      dataToUpdate.constraintType = body.constraintType;
    if (body.pinnedDate !== undefined)
      dataToUpdate.pinnedDate = body.pinnedDate ? new Date(body.pinnedDate) : null;
    if (body.color !== undefined) dataToUpdate.color = body.color;
    if (body.order !== undefined) dataToUpdate.order = Number(body.order);

    const updated = await prisma.task.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.task.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
