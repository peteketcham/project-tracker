"use client";

import React, { useState, useEffect } from "react";
import { KanbanTask } from "./KanbanBoard";
import {
  X,
  Clock,
  Pin,
  Flame,
  Link,
  Plus,
  Trash2,
  Zap,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { formatMinutes } from "@/lib/utils";
import { format } from "date-fns";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: KanbanTask | null;
  allTasks: KanbanTask[];
  onSave: (taskData: Partial<KanbanTask> & { newDependency?: any }) => Promise<void>;
  onDeleteDependency?: (depId: string) => Promise<void>;
}

export function TaskModal({
  isOpen,
  onClose,
  task,
  allTasks,
  onSave,
  onDeleteDependency,
}: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<KanbanTask["status"]>("SCHEDULED");
  const [priority, setPriority] = useState<KanbanTask["priority"]>("MEDIUM");
  const [baseDurationMinutes, setBaseDurationMinutes] = useState(60);
  const [setupMinutes, setSetupMinutes] = useState(15);
  const [takedownMinutes, setTakedownMinutes] = useState(10);
  const [constraintType, setConstraintType] = useState("ASAP");
  const [pinnedDate, setPinnedDate] = useState("");
  const [color, setColor] = useState("#3b82f6");

  // New dependency form
  const [selectedPredecessorId, setSelectedPredecessorId] = useState("");
  const [dependencyType, setDependencyType] = useState("FS");
  const [lagMinutes, setLagMinutes] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Close on Escape key (WCAG 2.1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setStatus(task.status || "SCHEDULED");
      setPriority(task.priority || "MEDIUM");
      setBaseDurationMinutes(task.baseDurationMinutes || 60);
      setSetupMinutes(task.setupMinutes !== undefined ? task.setupMinutes : 15);
      setTakedownMinutes(task.takedownMinutes !== undefined ? task.takedownMinutes : 10);
      setConstraintType(task.constraintType || "ASAP");
      setPinnedDate(
        task.pinnedDate
          ? format(new Date(task.pinnedDate), "yyyy-MM-dd'T'HH:mm")
          : ""
      );
      setColor(task.color || "#3b82f6");
    } else {
      setTitle("");
      setDescription("");
      setStatus("SCHEDULED");
      setPriority("MEDIUM");
      setBaseDurationMinutes(60);
      setSetupMinutes(15);
      setTakedownMinutes(10);
      setConstraintType("ASAP");
      setPinnedDate("");
      setColor("#3b82f6");
    }
    setSelectedPredecessorId("");
    setDependencyType("FS");
    setLagMinutes(0);
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: any = {
        title,
        description,
        status,
        priority,
        baseDurationMinutes: Number(baseDurationMinutes),
        setupMinutes: Number(setupMinutes),
        takedownMinutes: Number(takedownMinutes),
        constraintType,
        pinnedDate: pinnedDate ? new Date(pinnedDate).toISOString() : null,
        color,
      };

      if (selectedPredecessorId) {
        payload.newDependency = {
          predecessorId: selectedPredecessorId,
          type: dependencyType,
          lagMinutes: Number(lagMinutes) || 0,
        };
      }

      await onSave(payload);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const totalEffectivePlanned =
    Number(setupMinutes) + Number(baseDurationMinutes) + Number(takedownMinutes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center space-x-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <h2
              id="task-modal-title"
              className="text-base font-bold text-zinc-900 dark:text-zinc-100"
            >
              {task ? "Task Inspector & Constraints" : "Create New Task"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task dialog"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label
              htmlFor="task-title-input"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Task Title
            </label>
            <input
              id="task-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Roast Turkey & Make Pan Gravy"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-desc-input"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Description & Notes
            </label>
            <textarea
              id="task-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key steps, ingredients, tools required, or success criteria..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
            />
          </div>

          {/* Status & Priority & Color */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="task-status-select"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
              >
                Status
              </label>
              <select
                id="task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
              >
                <option value="BACKLOG">Backlog (Unscheduled)</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PAUSED">Paused / Interrupted</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="task-priority-select"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
              >
                Priority
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="task-color-input"
                className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
              >
                Tag Color
              </label>
              <div className="flex items-center space-x-2">
                <input
                  id="task-color-input"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-zinc-300 cursor-pointer p-0.5 focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{color}</span>
              </div>
            </div>
          </div>

          {/* Time Management: Base Duration vs Setup vs Takedown */}
          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-950 dark:text-blue-100 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>Time Model & Context-Switching Buffers</span>
              </span>
              <span className="text-xs font-bold text-blue-800 dark:text-blue-200">
                Total Planned: {formatMinutes(totalEffectivePlanned)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="task-base-dur-input"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Focused Work (Minutes)
                </label>
                <input
                  id="task-base-dur-input"
                  type="number"
                  min="5"
                  step="5"
                  value={baseDurationMinutes}
                  onChange={(e) => setBaseDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                />
                <span className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 block">
                  = {formatMinutes(baseDurationMinutes)}
                </span>
              </div>

              <div>
                <label
                  htmlFor="task-setup-input"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Setup / Warm-up (Minutes)
                </label>
                <input
                  id="task-setup-input"
                  type="number"
                  min="0"
                  step="5"
                  value={setupMinutes}
                  onChange={(e) => setSetupMinutes(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                />
                <span className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5 block font-medium">
                  Gathering tools & station prep
                </span>
              </div>

              <div>
                <label
                  htmlFor="task-takedown-input"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Takedown / Wrap-up (Minutes)
                </label>
                <input
                  id="task-takedown-input"
                  type="number"
                  min="0"
                  step="5"
                  value={takedownMinutes}
                  onChange={(e) => setTakedownMinutes(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                />
                <span className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5 block font-medium">
                  Cleaning station & saving state
                </span>
              </div>
            </div>
          </div>

          {/* Date Constraints & Pinning */}
          <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60 space-y-3">
            <span className="text-xs font-bold text-purple-950 dark:text-purple-100 flex items-center space-x-1.5">
              <Pin className="w-3.5 h-3.5 text-purple-600 rotate-45" aria-hidden="true" />
              <span>Scheduling Constraint & Date Pinning</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="task-constraint-select"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Constraint Type
                </label>
                <select
                  id="task-constraint-select"
                  value={constraintType}
                  onChange={(e) => setConstraintType(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none"
                >
                  <option value="ASAP">As Soon As Possible (ASAP - Default)</option>
                  <option value="MUST_START_ON">📌 Must Start On (Fixed start date)</option>
                  <option value="MUST_FINISH_ON">📌 Must Finish On (Hard deadline)</option>
                  <option value="START_NO_EARLIER_THAN">Start No Earlier Than (SNET)</option>
                  <option value="FINISH_NO_LATER_THAN">Finish No Later Than (FNLT)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="task-pinned-date-input"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Pinned Target Date & Time
                </label>
                <input
                  id="task-pinned-date-input"
                  type="datetime-local"
                  value={pinnedDate}
                  onChange={(e) => setPinnedDate(e.target.value)}
                  disabled={constraintType === "ASAP"}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Dependencies Section */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
              <Link className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
              <span>Prerequisites & Predecessors</span>
            </span>

            {/* Existing Dependencies */}
            {task?.dependenciesAsSuccessor && task.dependenciesAsSuccessor.length > 0 ? (
              <div className="space-y-1.5">
                {task.dependenciesAsSuccessor.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                  >
                    <span className="text-zinc-800 dark:text-zinc-200">
                      Depends on: <strong>{dep.predecessor.title}</strong>
                    </span>
                    {onDeleteDependency && (
                      <button
                        type="button"
                        onClick={() => onDeleteDependency(dep.id)}
                        aria-label={`Remove dependency on ${dep.predecessor.title}`}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1 rounded focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">No prerequisites yet.</p>
            )}

            {/* Add new dependency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="sm:col-span-2">
                <label htmlFor="add-pred-task-select" className="sr-only">
                  Select prerequisite task to link
                </label>
                <select
                  id="add-pred-task-select"
                  value={selectedPredecessorId}
                  onChange={(e) => setSelectedPredecessorId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                >
                  <option value="">+ Link Prerequisite Task...</option>
                  {allTasks
                    .filter((t) => t.id !== task?.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="add-dep-type-select" className="sr-only">
                  Dependency relation type
                </label>
                <select
                  id="add-dep-type-select"
                  value={dependencyType}
                  onChange={(e) => setDependencyType(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
                >
                  <option value="FS">Finish-to-Start (FS)</option>
                  <option value="SS">Start-to-Start (SS)</option>
                  <option value="FF">Finish-to-Finish (FF)</option>
                  <option value="SF">Start-to-Finish (SF)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Interruption History (if any) */}
          {task?.interruptionLogs && task.interruptionLogs.length > 0 && (
            <div className="p-3.5 rounded-xl bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900/60 text-xs space-y-2">
              <span className="font-bold text-pink-950 dark:text-pink-100 flex items-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-pink-600" aria-hidden="true" />
                <span>Interruption Log ({task.interruptionLogs.length} events recorded)</span>
              </span>
              <div className="space-y-1.5">
                {task.interruptionLogs.map((log) => (
                  <div
                    key={log.id}
                    className="text-xs text-zinc-700 dark:text-zinc-300 flex items-center justify-between"
                  >
                    <span>Reason: &ldquo;{log.reason || "Unspecified switch"}&rdquo;</span>
                    <span className="font-bold text-pink-700 dark:text-pink-300">
                      +{log.overheadAddedMinutes}m penalty
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:outline-none transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none shadow-sm"
            >
              {isSaving ? "Saving..." : task ? "Update Task & Recalculate" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
