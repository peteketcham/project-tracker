"use client";

import React, { useState } from "react";
import {
  Clock,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Pin,
  Flame,
  ArrowRight,
  Zap,
  MoreVertical,
  Trash2,
  Edit2,
  Calendar,
} from "lucide-react";
import { formatMinutes } from "@/lib/utils";
import { format } from "date-fns";

export interface KanbanTask {
  id: string;
  title: string;
  description?: string | null;
  status: "BACKLOG" | "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  baseDurationMinutes: number;
  setupMinutes: number;
  takedownMinutes: number;
  constraintType: string;
  pinnedDate?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  color?: string;
  order: number;
  isCritical?: boolean;
  totalFloatMinutes?: number | null;
  totalPlannedDurationMinutes?: number;
  dependenciesAsSuccessor?: Array<{ id: string; predecessor: { id: string; title: string } }>;
  dependenciesAsPredecessor?: Array<{ id: string; successor: { id: string; title: string } }>;
  interruptionLogs?: Array<{ id: string; reason?: string | null; overheadAddedMinutes: number }>;
}

interface KanbanBoardProps {
  tasks: KanbanTask[];
  onTaskClick: (task: KanbanTask) => void;
  onEditTask: (task: KanbanTask) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTask: (taskId: string) => void;
  onPauseTaskPrompt: (task: KanbanTask) => void;
  onResumeTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onMoveTaskStatus: (taskId: string, targetStatus: KanbanTask["status"]) => void;
}

const COLUMNS: Array<{
  id: KanbanTask["status"];
  title: string;
  dotColor: string;
  bgLight: string;
}> = [
  { id: "BACKLOG", title: "Backlog", dotColor: "bg-zinc-600 dark:bg-zinc-400", bgLight: "border-zinc-300 dark:border-zinc-800" },
  { id: "SCHEDULED", title: "Scheduled", dotColor: "bg-blue-600 dark:bg-blue-400", bgLight: "border-blue-300 dark:border-blue-900/40" },
  { id: "IN_PROGRESS", title: "In Progress", dotColor: "bg-amber-600 dark:bg-amber-400", bgLight: "border-amber-300 dark:border-amber-900/40" },
  { id: "PAUSED", title: "Paused / Interrupted", dotColor: "bg-pink-600 dark:bg-pink-400", bgLight: "border-pink-300 dark:border-pink-900/40" },
  { id: "DONE", title: "Done", dotColor: "bg-emerald-600 dark:bg-emerald-400", bgLight: "border-emerald-300 dark:border-emerald-900/40" },
];

export function KanbanBoard({
  tasks,
  onTaskClick,
  onEditTask,
  onDeleteTask,
  onStartTask,
  onPauseTaskPrompt,
  onResumeTask,
  onCompleteTask,
  onMoveTaskStatus,
}: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: KanbanTask["status"]) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    if (taskId) {
      onMoveTaskStatus(taskId, targetStatus);
    }
    setDraggedTaskId(null);
  };

  return (
    <div
      role="region"
      aria-label="Agile Kanban Board"
      className="grid grid-cols-1 md:grid-cols-5 gap-4 h-full p-4 overflow-x-auto min-h-[calc(100vh-140px)]"
    >
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.id);

        return (
          <section
            key={col.id}
            role="region"
            aria-label={`${col.title} column, ${columnTasks.length} tasks`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`flex flex-col bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border ${col.bgLight} p-3 min-w-[260px] h-full shadow-xs`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-3">
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} aria-hidden="true" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                  {col.title}
                </h2>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold"
                aria-label={`${columnTasks.length} tasks in ${col.title}`}
              >
                {columnTasks.length}
              </span>
            </div>

            {/* Task Cards Container */}
            <div className="space-y-3 overflow-y-auto flex-1 pr-1 pb-4">
              {columnTasks.map((task) => {
                const isInterrupted = (task.interruptionLogs?.length || 0) > 0;
                const totalOverhead =
                  task.interruptionLogs?.reduce(
                    (sum, log) => sum + log.overheadAddedMinutes,
                    0
                  ) || 0;

                return (
                  <article
                    key={task.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Task: ${task.title}, priority ${task.priority}, duration ${formatMinutes(task.baseDurationMinutes)}${task.isCritical ? ', Critical Path' : ''}. Press Enter to inspect.`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onTaskClick(task)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTaskClick(task);
                      }
                    }}
                    className={`group relative bg-white dark:bg-zinc-900 rounded-lg border transition-all shadow-xs hover:shadow-md cursor-grab active:cursor-grabbing p-3 text-left focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
                      task.isCritical
                        ? "border-red-500 dark:border-red-500 ring-1 ring-red-500/40"
                        : "border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700"
                    }`}
                  >
                    {/* Top Row: Priority & Badges */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        {/* Priority Badge with WCAG 2 AA Contrast */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                            task.priority === "URGENT"
                              ? "bg-red-100 text-red-950 border-red-300 dark:bg-red-950/80 dark:text-red-200 dark:border-red-800"
                              : task.priority === "HIGH"
                              ? "bg-amber-100 text-amber-950 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800"
                              : task.priority === "MEDIUM"
                              ? "bg-blue-100 text-blue-950 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800"
                              : "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700"
                          }`}
                        >
                          {task.priority}
                        </span>

                        {/* Critical Path Badge */}
                        {task.isCritical && (
                          <span
                            className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-950 dark:bg-red-950/80 dark:text-red-200 border border-red-300 dark:border-red-800"
                            title="Critical Path Bottleneck"
                          >
                            <Flame className="w-3 h-3 text-red-600 dark:text-red-400" aria-hidden="true" />
                            <span>Critical</span>
                          </span>
                        )}

                        {/* Pinned Constraint Badge */}
                        {task.constraintType !== "ASAP" && (
                          <span
                            className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-950 dark:bg-purple-950/80 dark:text-purple-200 border border-purple-300 dark:border-purple-800"
                            title={`Constraint: ${task.constraintType}`}
                          >
                            <Pin className="w-2.5 h-2.5 rotate-45 text-purple-700 dark:text-purple-300" aria-hidden="true" />
                            <span>
                              {task.constraintType === "MUST_FINISH_ON"
                                ? "Pin Finish"
                                : task.constraintType === "MUST_START_ON"
                                ? "Pin Start"
                                : task.constraintType}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Action Menu Buttons */}
                      <div className="flex items-center space-x-1 opacity-80 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTask(task);
                          }}
                          aria-label={`Edit task: ${task.title}`}
                          className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                        >
                          <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask(task.id);
                          }}
                          aria-label={`Delete task: ${task.title}`}
                          className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-600 hover:text-red-700 dark:text-zinc-400 dark:hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Task Title */}
                    <h3 className="text-xs font-bold text-zinc-950 dark:text-zinc-50 line-clamp-2 mb-2 leading-relaxed">
                      {task.title}
                    </h3>

                    {/* Time & Transition Breakdown */}
                    <div className="bg-zinc-100/80 dark:bg-zinc-950/80 rounded-md p-2.5 border border-zinc-200 dark:border-zinc-800 mb-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-zinc-500" aria-hidden="true" />
                          <span>Focused Work:</span>
                        </span>
                        <strong className="text-zinc-950 dark:text-zinc-50">
                          {formatMinutes(task.baseDurationMinutes)}
                        </strong>
                      </div>

                      {/* Setup & Takedown Visual Caps with Accessible Contrast */}
                      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                        <span>
                          Setup: <strong className="text-blue-700 dark:text-blue-300 font-bold">+{task.setupMinutes}m</strong>
                        </span>
                        <span>
                          Takedown: <strong className="text-indigo-700 dark:text-indigo-300 font-bold">+{task.takedownMinutes}m</strong>
                        </span>
                      </div>

                      {/* Scheduled Time Slot */}
                      {task.scheduledStart && (
                        <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400">
                          <span className="flex items-center space-x-1 font-medium">
                            <Calendar className="w-3 h-3" aria-hidden="true" />
                            <span>
                              {format(new Date(task.scheduledStart), "MMM d, h:mm a")}
                            </span>
                          </span>
                          {task.totalFloatMinutes !== null && task.totalFloatMinutes !== undefined && (
                            <span className={task.totalFloatMinutes <= 15 ? "text-red-700 dark:text-red-400 font-bold" : "text-zinc-600 dark:text-zinc-400"}>
                              Float: {task.totalFloatMinutes}m
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Interruption Indicator */}
                    {isInterrupted && (
                      <div className="flex items-center space-x-1.5 text-xs text-pink-900 dark:text-pink-200 font-bold mb-2 bg-pink-100 dark:bg-pink-950/60 border border-pink-300 dark:border-pink-800 px-2.5 py-1 rounded-md">
                        <Zap className="w-3 h-3 text-pink-700 dark:text-pink-400" aria-hidden="true" />
                        <span>
                          {task.interruptionLogs?.length} pause(s) (+{totalOverhead}m overhead)
                        </span>
                      </div>
                    )}

                    {/* Dependencies Preview */}
                    {(task.dependenciesAsSuccessor?.length || 0) > 0 && (
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-2">
                        <span>Prerequisites: </span>
                        <strong className="text-zinc-800 dark:text-zinc-200">
                          {task.dependenciesAsSuccessor?.map((d) => d.predecessor.title).join(", ").slice(0, 32)}...
                        </strong>
                      </div>
                    )}

                    {/* Card Footer Quick Actions */}
                    <div
                      className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {task.status === "SCHEDULED" || task.status === "BACKLOG" ? (
                        <button
                          type="button"
                          onClick={() => onStartTask(task.id)}
                          aria-label={`Start task: ${task.title}`}
                          className="flex items-center space-x-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none rounded px-1"
                        >
                          <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                          <span>Start Task</span>
                        </button>
                      ) : task.status === "IN_PROGRESS" ? (
                        <div className="flex items-center space-x-2 w-full justify-between">
                          <button
                            type="button"
                            onClick={() => onPauseTaskPrompt(task)}
                            aria-label={`Interrupt and pause task: ${task.title}`}
                            className="flex items-center space-x-1 text-xs font-bold text-pink-700 hover:text-pink-900 dark:text-pink-400 dark:hover:text-pink-300 focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:outline-none rounded px-1"
                          >
                            <Pause className="w-3 h-3 fill-current" aria-hidden="true" />
                            <span>Interrupt / Pause</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCompleteTask(task.id)}
                            aria-label={`Mark task completed: ${task.title}`}
                            className="flex items-center space-x-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none rounded px-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Done</span>
                          </button>
                        </div>
                      ) : task.status === "PAUSED" ? (
                        <div className="flex items-center space-x-2 w-full justify-between">
                          <button
                            type="button"
                            onClick={() => onResumeTask(task.id)}
                            aria-label={`Resume task: ${task.title}`}
                            className="flex items-center space-x-1 text-xs font-bold text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none rounded px-1"
                          >
                            <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                            <span>Resume</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCompleteTask(task.id)}
                            aria-label={`Mark task completed: ${task.title}`}
                            className="flex items-center space-x-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none rounded px-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Done</span>
                          </button>
                        </div>
                      ) : (
                        <span className="flex items-center space-x-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Completed</span>
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}

              {columnTasks.length === 0 && (
                <div className="h-28 flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-lg text-zinc-500 text-xs">
                  <span>No tasks</span>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
