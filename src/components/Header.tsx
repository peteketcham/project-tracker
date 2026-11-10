"use client";

import React from "react";
import {
  BarChart3,
  Columns,
  LayoutGrid,
  Plus,
  Sparkles,
  Flame,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { formatMinutes } from "@/lib/utils";
import { format } from "date-fns";

interface HeaderProps {
  viewMode: "kanban" | "gantt" | "split";
  setViewMode: (mode: "kanban" | "gantt" | "split") => void;
  onOpenNewTask: () => void;
  onOpenAIDecompose: () => void;
  onRefresh: () => void;
  scheduleOverview?: {
    projectStart: string;
    projectEnd: string;
    criticalPathTaskIds: string[];
    hasCycle: boolean;
  };
  totalInterruptionOverheadMinutes: number;
}

export function Header({
  viewMode,
  setViewMode,
  onOpenNewTask,
  onOpenAIDecompose,
  onRefresh,
  scheduleOverview,
  totalInterruptionOverheadMinutes,
}: HeaderProps) {
  const formattedEnd = scheduleOverview?.projectEnd
    ? format(new Date(scheduleOverview.projectEnd), "EEE, MMM d • h:mm a")
    : "Calculating...";

  return (
    <header
      role="banner"
      className="border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur sticky top-0 z-30 shadow-xs"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Logo & App Title */}
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 flex-shrink-0"
              aria-hidden="true"
            >
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Antigravity Tracker
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-800">
                  Time-Aware
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Agile Board & Reactive Gantt with Transition Overhead Modeling
              </p>
            </div>
          </div>

          {/* Quick Metrics & Critical Path Status */}
          <div className="flex flex-wrap items-center gap-2 text-xs" role="region" aria-label="Project Status Summary">
            {scheduleOverview?.hasCycle && (
              <div
                role="alert"
                className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-800 font-bold"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                <span>Dependency Cycle Detected</span>
              </div>
            )}

            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium">
              <span className="text-zinc-500 dark:text-zinc-400">Target Finish:</span>
              <span className="font-bold text-zinc-950 dark:text-zinc-50">
                {formattedEnd}
              </span>
            </div>

            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-red-100 text-red-950 dark:bg-red-950/80 dark:text-red-200 border border-red-300 dark:border-red-800 font-bold">
              <Flame className="w-3.5 h-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
              <span>
                {scheduleOverview?.criticalPathTaskIds.length || 0} Critical Tasks
              </span>
            </div>

            {totalInterruptionOverheadMinutes > 0 && (
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-pink-100 text-pink-950 dark:bg-pink-950/80 dark:text-pink-200 border border-pink-300 dark:border-pink-800 font-bold">
                <span>⚡ {formatMinutes(totalInterruptionOverheadMinutes)} switch overhead</span>
              </div>
            )}
          </div>

          {/* Navigation Controls & Actions */}
          <nav
            role="navigation"
            aria-label="View Modes and Actions"
            className="flex items-center space-x-2 w-full md:w-auto justify-end"
          >
            {/* View Mode Toggle */}
            <div
              role="radiogroup"
              aria-label="Display View Layout"
              className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-300 dark:border-zinc-800 text-xs"
            >
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md font-bold transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
                  viewMode === "kanban"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50"
                }`}
              >
                <Columns className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Board</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "gantt"}
                onClick={() => setViewMode("gantt")}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md font-bold transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
                  viewMode === "gantt"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 rotate-90" aria-hidden="true" />
                <span>Gantt</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "split"}
                onClick={() => setViewMode("split")}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md font-bold transition-all focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
                  viewMode === "split"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs"
                    : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Split</span>
              </button>
            </div>

            {/* Recalculate Button */}
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Recalculate and refresh schedule"
              className="p-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none transition"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>

            {/* AI Decompose Button */}
            <button
              type="button"
              onClick={onOpenAIDecompose}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white shadow-xs focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none transition"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>AI Decompose</span>
            </button>

            {/* New Task Button */}
            <button
              type="button"
              onClick={onOpenNewTask}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none transition"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New Task</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
