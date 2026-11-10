"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { KanbanBoard, KanbanTask } from "@/components/KanbanBoard";
import { GanttChart } from "@/components/GanttChart";
import { TaskModal } from "@/components/TaskModal";
import { AIDecomposeModal } from "@/components/AIDecomposeModal";
import { InterruptionModal } from "@/components/InterruptionModal";
import { Loader2 } from "lucide-react";

export default function ProjectTrackerHome() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [dependencies, setDependencies] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [scheduleOverview, setScheduleOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  // View state: "kanban" | "gantt" | "split"
  const [viewMode, setViewMode] = useState<"kanban" | "gantt" | "split">("split");

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);

  const [isAIDecomposeOpen, setIsAIDecomposeOpen] = useState(false);

  const [isInterruptionModalOpen, setIsInterruptionModalOpen] = useState(false);
  const [taskToInterrupt, setTaskToInterrupt] = useState<KanbanTask | null>(null);

  // Announce dynamic changes for screen readers
  const announce = (message: string) => {
    setAnnouncement(message);
    setTimeout(() => setAnnouncement(""), 4000);
  };

  // Load project data
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to load project tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
      setDependencies(data.dependencies || []);
      setSettings(data.settings || null);
      setScheduleOverview(data.scheduleOverview || null);
    } catch (err) {
      console.error("Error loading tasks:", err);
      announce("Error loading project schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create or update task
  const handleSaveTask = async (
    taskData: Partial<KanbanTask> & { newDependency?: any }
  ) => {
    try {
      let savedTask: any;
      if (editingTask) {
        // Update
        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskData),
        });
        savedTask = await res.json();
        announce(`Task "${savedTask.title}" updated.`);
      } else {
        // Create
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskData),
        });
        savedTask = await res.json();
        announce(`New task "${savedTask.title}" created.`);
      }

      // Add new dependency if specified
      if (taskData.newDependency && savedTask?.id) {
        await fetch("/api/dependencies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predecessorId: taskData.newDependency.predecessorId,
            successorId: savedTask.id,
            type: taskData.newDependency.type,
            lagMinutes: taskData.newDependency.lagMinutes,
          }),
        });
      }

      await loadData();
    } catch (err) {
      console.error("Error saving task:", err);
      announce("Failed to save task.");
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.id === taskId);
    if (!confirm(`Are you sure you want to delete "${taskToDelete?.title || "this task"}"?`)) return;
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      announce(`Task "${taskToDelete?.title}" deleted.`);
      await loadData();
    } catch (err) {
      console.error("Error deleting task:", err);
      announce("Failed to delete task.");
    }
  };

  // Delete dependency
  const handleDeleteDependency = async (depId: string) => {
    try {
      await fetch(`/api/dependencies/${depId}`, { method: "DELETE" });
      announce("Prerequisite dependency removed.");
      await loadData();
    } catch (err) {
      console.error("Error deleting dependency:", err);
    }
  };

  // Start task session
  const handleStartTask = async (taskId: string) => {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "START" }),
      });
      const t = tasks.find((item) => item.id === taskId);
      announce(`Task "${t?.title || ""}" started.`);
      await loadData();
    } catch (err) {
      console.error("Error starting task:", err);
    }
  };

  // Prompt interruption modal
  const handlePauseTaskPrompt = (task: KanbanTask) => {
    setTaskToInterrupt(task);
    setIsInterruptionModalOpen(true);
  };

  // Confirm pause & log interruption
  const handleConfirmPause = async (taskId: string, reason: string) => {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "PAUSE", reason }),
      });
      const t = tasks.find((item) => item.id === taskId);
      announce(`Task "${t?.title || ""}" paused. Incurred takedown buffer.`);
      await loadData();
    } catch (err) {
      console.error("Error pausing task:", err);
    }
  };

  // Resume paused task
  const handleResumeTask = async (taskId: string) => {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "RESUME" }),
      });
      const t = tasks.find((item) => item.id === taskId);
      announce(`Task "${t?.title || ""}" resumed. Injected setup buffer.`);
      await loadData();
    } catch (err) {
      console.error("Error resuming task:", err);
    }
  };

  // Complete task
  const handleCompleteTask = async (taskId: string) => {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "COMPLETE" }),
      });
      const t = tasks.find((item) => item.id === taskId);
      announce(`Task "${t?.title || ""}" marked completed.`);
      await loadData();
    } catch (err) {
      console.error("Error completing task:", err);
    }
  };

  // Drag and drop status movement
  const handleMoveTaskStatus = async (
    taskId: string,
    targetStatus: KanbanTask["status"]
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    if (targetStatus === "IN_PROGRESS") {
      await handleStartTask(taskId);
    } else if (targetStatus === "PAUSED") {
      handlePauseTaskPrompt(task);
    } else if (targetStatus === "DONE") {
      await handleCompleteTask(taskId);
    } else {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      announce(`Task "${task.title}" moved to ${targetStatus}.`);
      await loadData();
    }
  };

  // AI Decompose feature
  const handleAIDecompose = async (prompt: string, targetDays: number) => {
    const res = await fetch("/api/ai-decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, targetDays }),
    });
    if (!res.ok) throw new Error("AI decomposition failed");
    announce("AI project decomposition complete. New tasks and schedule generated.");
    await loadData();
  };

  // Calculate total interruption overhead across all tasks
  const totalInterruptionOverheadMinutes = tasks.reduce((sum, t) => {
    const logs = t.interruptionLogs || [];
    return sum + logs.reduce((sub, l) => sub + l.overheadAddedMinutes, 0);
  }, 0);

  const activePausedCount = tasks.filter((t) => t.status === "PAUSED").length;

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
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Header */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenNewTask={() => {
          setEditingTask(null);
          setIsTaskModalOpen(true);
        }}
        onOpenAIDecompose={() => setIsAIDecomposeOpen(true)}
        onRefresh={() => {
          loadData();
          announce("Recalculating project schedule...");
        }}
        scheduleOverview={scheduleOverview}
        totalInterruptionOverheadMinutes={totalInterruptionOverheadMinutes}
        activePausedCount={activePausedCount}
      />

      {/* Main Content Area */}
      <main
        id="main-content"
        role="main"
        tabIndex={-1}
        className="flex-1 p-4 max-w-7xl mx-auto w-full flex flex-col focus:outline-none"
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-24" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
            <span className="ml-3 text-sm text-zinc-600 dark:text-zinc-400 font-medium">
              Calculating timeline & context buffers...
            </span>
          </div>
        ) : viewMode === "kanban" ? (
          /* Kanban Board Only */
          <div className="flex-1">
            <KanbanBoard
              tasks={tasks}
              onTaskClick={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onEditTask={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              onDeleteTask={handleDeleteTask}
              onStartTask={handleStartTask}
              onPauseTaskPrompt={handlePauseTaskPrompt}
              onResumeTask={handleResumeTask}
              onCompleteTask={handleCompleteTask}
              onMoveTaskStatus={handleMoveTaskStatus}
            />
          </div>
        ) : viewMode === "gantt" ? (
          /* Gantt Chart Only */
          <div className="flex-1 min-h-[600px]">
            <GanttChart
              tasks={tasks}
              dependencies={dependencies}
              onTaskClick={(task) => {
                setEditingTask(task);
                setIsTaskModalOpen(true);
              }}
              projectStartDate={scheduleOverview?.projectStart}
              projectEndDate={scheduleOverview?.projectEnd}
            />
          </div>
        ) : (
          /* Split View (Both Kanban & Gantt) */
          <div className="flex flex-col gap-6 flex-1">
            {/* Top: Kanban Board */}
            <div className="h-[430px] overflow-hidden">
              <KanbanBoard
                tasks={tasks}
                onTaskClick={(task) => {
                  setEditingTask(task);
                  setIsTaskModalOpen(true);
                }}
                onEditTask={(task) => {
                  setEditingTask(task);
                  setIsTaskModalOpen(true);
                }}
                onDeleteTask={handleDeleteTask}
                onStartTask={handleStartTask}
                onPauseTaskPrompt={handlePauseTaskPrompt}
                onResumeTask={handleResumeTask}
                onCompleteTask={handleCompleteTask}
                onMoveTaskStatus={handleMoveTaskStatus}
              />
            </div>

            {/* Bottom: Gantt Timeline */}
            <div className="h-[460px]">
              <GanttChart
                tasks={tasks}
                dependencies={dependencies}
                onTaskClick={(task) => {
                  setEditingTask(task);
                  setIsTaskModalOpen(true);
                }}
                projectStartDate={scheduleOverview?.projectStart}
                projectEndDate={scheduleOverview?.projectEnd}
              />
            </div>
          </div>
        )}
      </main>

      {/* Task Create / Edit Modal */}
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

      {/* AI Decompose Modal */}
      <AIDecomposeModal
        isOpen={isAIDecomposeOpen}
        onClose={() => setIsAIDecomposeOpen(false)}
        onDecompose={handleAIDecompose}
      />

      {/* Interruption / Pause Modal */}
      <InterruptionModal
        isOpen={isInterruptionModalOpen}
        onClose={() => {
          setIsInterruptionModalOpen(false);
          setTaskToInterrupt(null);
        }}
        task={taskToInterrupt}
        onConfirmPause={handleConfirmPause}
      />
    </div>
  );
}
