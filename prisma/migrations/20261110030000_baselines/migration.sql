-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BaselineEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "baselineId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "plannedStart" DATETIME NOT NULL,
    "plannedEnd" DATETIME NOT NULL,
    CONSTRAINT "BaselineEntry_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "Baseline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BaselineEntry_baselineId_idx" ON "BaselineEntry"("baselineId");
