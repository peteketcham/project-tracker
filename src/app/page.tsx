"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { KanbanBoard, KanbanTask } from "@/components/KanbanBoard";
import { GanttChart } from "@/components/GanttChart";
import { TaskModal } from "@/components/TaskModal";
import { AIDecomposeModal } from "@/components/AIDecomposeModal";
import { InterruptionModal } from "@/components/InterruptionModal";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { api, type NewDependency, type ScheduleResponse } from "@/lib/client";

type ViewMode = "kanban" | "gantt" | "split";

export default function ProjectTrackerHome() {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [isAIDecomposeOpen, setIsAIDecomposeOpen] = useState(false);
  const [taskToInterrupt, setTaskToInterrupt] = useState<KanbanTask | null>(null);

  const tasks = data?.tasks ?? [];
  const dependencies = data?.dependencies ?? [];
  const scheduleOverview = data?.scheduleOverview;

  // Announce dynamic changes for screen readers
  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    setTimeout(() => setAnnouncement(""), 4000);
  }, []);

  const refresh = useCallback(async () => {
    setData(await api<ScheduleResponse>("/api/tasks"));
  }, []);

  useEffect(() => {
    let alive = true;
    api<ScheduleResponse>("/api/tasks")
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  /** Runs a change, then reloads the schedule. Failures are shown and announced, never swallowed. */
  const run = useCallback(
    async (change: () => Promise<string | void>) => {
      try {
        const message = await change();
        setError(null);
        if (message) announce(message);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong";
        setError(message);
        announce(message);
      }
      try {
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the schedule");
      }
    },
    [announce, refresh]
  );

  const titleOf = (taskId: string) => tasks.find((t) => t.id === taskId)?.title ?? "task";

  const session = (taskId: string, action: string, done: string, reason?: string) =>
    run(async () => {
      await api("/api/sessions", "POST", { taskId, action, reason });
      return `Task "${titleOf(taskId)}" ${done}`;
    });

  const handleSaveTask = (taskData: Partial<KanbanTask> & { newDependency?: NewDependency }) =>
    run(async () => {
      const { newDependency, ...fields } = taskData;
      const saved = editingTask
        ? await api<KanbanTask>(`/api/tasks/${editingTask.id}`, "PUT", fields)
        : await api<KanbanTask>("/api/tasks", "POST", fields);
      if (newDependency) {
        await api("/api/dependencies", "POST", { ...newDependency, successorId: saved.id });
      }
      return editingTask ? `Task "${saved.title}" updated.` : `New task "${saved.title}" created.`;
    });

  const handleDeleteTask = (taskId: string) => {
    const title = titleOf(taskId);
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    return run(async () => {
      await api(`/api/tasks/${taskId}`, "DELETE");
      return `Task "${title}" deleted.`;
    });
  };

  const handleDeleteDependency = (depId: string) =>
    run(async () => {
      await api(`/api/dependencies/${depId}`, "DELETE");
      return "Prerequisite dependency removed.";
    });

  const handleStartTask = (taskId: string) => session(taskId, "START", "started.");
  const handleResumeTask = (taskId: string) =>
    session(taskId, "RESUME", "resumed. Setup buffer added.");
  const handleCompleteTask = (taskId: string) => session(taskId, "COMPLETE", "marked completed.");
  const handleConfirmPause = (taskId: string, reason: string) =>
    session(taskId, "PAUSE", "paused. Takedown buffer added.", reason);

  // Drag and drop status movement
  const handleMoveTaskStatus = async (taskId: string, targetStatus: KanbanTask["status"]) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    if (targetStatus === "IN_PROGRESS") {
      await handleStartTask(taskId);
    } else if (targetStatus === "PAUSED") {
      setTaskToInterrupt(task);
    } else if (targetStatus === "DONE") {
      await handleCompleteTask(taskId);
    } else {
      await run(async () => {
        await api(`/api/tasks/${taskId}`, "PUT", { status: targetStatus });
        return `Task "${task.title}" moved to ${targetStatus}.`;
      });
    }
  };

  const handleAIDecompose = async (prompt: string, targetDays: number) => {
    await api("/api/ai-decompose", "POST", { prompt, targetDays });
    announce("Decomposition complete. New tasks and schedule generated.");
    await refresh();
  };

  const totalInterruptionOverheadMinutes = tasks.reduce(
    (sum, t) => sum + (t.interruptionLogs ?? []).reduce((s, l) => s + l.overheadAddedMinutes, 0),
    0
  );

  const openTask = (task: KanbanTask | null) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const board = (
    <KanbanBoard
      tasks={tasks}
      onTaskClick={openTask}
      onEditTask={openTask}
      onDeleteTask={handleDeleteTask}
      onStartTask={handleStartTask}
      onPauseTaskPrompt={setTaskToInterrupt}
      onResumeTask={handleResumeTask}
      onCompleteTask={handleCompleteTask}
      onMoveTaskStatus={handleMoveTaskStatus}
    />
  );

  const gantt = (
    <GanttChart
      tasks={tasks}
      dependencies={dependencies}
      onTaskClick={openTask}
      projectStartDate={scheduleOverview?.projectStart}
      projectEndDate={scheduleOverview?.projectEnd}
    />
  );

  return (
    <div className="min-h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* WCAG 2.1 Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      {/* Live Region for Screen Reader Announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenNewTask={() => openTask(null)}
        onOpenAIDecompose={() => setIsAIDecomposeOpen(true)}
        onRefresh={() => run(async () => "Schedule recalculated.")}
        scheduleOverview={scheduleOverview}
        totalInterruptionOverheadMinutes={totalInterruptionOverheadMinutes}
      />

      <main
        id="main-content"
        role="main"
        tabIndex={-1}
        className="flex-1 p-4 max-w-7xl mx-auto w-full flex flex-col focus:outline-none"
      >
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 px-4 py-3 rounded-lg bg-red-100 text-red-950 dark:bg-red-950/80 dark:text-red-100 border border-red-300 dark:border-red-800 text-sm"
          >
            <span className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="p-1 rounded focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:outline-none"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {data === null ? (
          !error && (
            <div className="flex-1 flex items-center justify-center py-24" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
              <span className="ml-3 text-sm text-zinc-600 dark:text-zinc-400 font-medium">
                Calculating timeline & context buffers...
              </span>
            </div>
          )
        ) : viewMode === "kanban" ? (
          <div className="flex-1">{board}</div>
        ) : viewMode === "gantt" ? (
          <div className="flex-1 min-h-[600px]">{gantt}</div>
        ) : (
          <div className="flex flex-col gap-6 flex-1">
            <div className="h-[430px] overflow-hidden">{board}</div>
            <div className="h-[460px]">{gantt}</div>
          </div>
        )}
      </main>

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        allTasks={tasks}
        onSave={handleSaveTask}
        onDeleteDependency={handleDeleteDependency}
      />

      <AIDecomposeModal
        isOpen={isAIDecomposeOpen}
        onClose={() => setIsAIDecomposeOpen(false)}
        onDecompose={handleAIDecompose}
      />

      <InterruptionModal
        isOpen={taskToInterrupt !== null}
        onClose={() => setTaskToInterrupt(null)}
        task={taskToInterrupt}
        onConfirmPause={handleConfirmPause}
      />
    </div>
  );
}
