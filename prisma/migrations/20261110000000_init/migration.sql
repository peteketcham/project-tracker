-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BACKLOG',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "baseDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "setupMinutes" INTEGER NOT NULL DEFAULT 15,
    "takedownMinutes" INTEGER NOT NULL DEFAULT 10,
    "constraintType" TEXT NOT NULL DEFAULT 'ASAP',
    "pinnedDate" DATETIME,
    "scheduledStart" DATETIME,
    "scheduledEnd" DATETIME,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FS',
    "lagMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sessionType" TEXT NOT NULL DEFAULT 'WORK',
    "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" DATETIME,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InterruptionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "pausedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumedAt" DATETIME,
    "reason" TEXT,
    "overheadAddedMinutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InterruptionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "workingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '17:00',
    "workDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "defaultSetupMinutes" INTEGER NOT NULL DEFAULT 15,
    "defaultTakedownMinutes" INTEGER NOT NULL DEFAULT 10,
    "autoCascade" BOOLEAN NOT NULL DEFAULT true,
    "highlightCriticalPath" BOOLEAN NOT NULL DEFAULT true,
    "projectStartDate" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_predecessorId_successorId_key" ON "TaskDependency"("predecessorId", "successorId");
