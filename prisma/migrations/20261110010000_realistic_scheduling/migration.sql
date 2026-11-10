-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assignee" TEXT;
ALTER TABLE "Task" ADD COLUMN "unattendedMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProjectSettings" ADD COLUMN "levelResources" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProjectSettings" ADD COLUMN "timezone" TEXT;
