"use client";

import React, { useState, useEffect } from "react";
import { KanbanTask } from "./KanbanBoard";
import { Pause, X, AlertTriangle } from "lucide-react";

interface InterruptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: KanbanTask | null;
  onConfirmPause: (taskId: string, reason: string) => Promise<void>;
}

export function InterruptionModal({
  isOpen,
  onClose,
  task,
  onConfirmPause,
}: InterruptionModalProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirmPause(task.id, reason);
      setReason("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const commonReasons = [
    "Stovetop burner / oven taken over by another dish",
    "Hardware store run for missing plumbing fittings",
    "School call / family interruption",
    "Thinset mortar or paint drying / curing break",
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interrupt-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-pink-50 dark:bg-pink-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-pink-600 text-white shadow-sm" aria-hidden="true">
              <Pause className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2
                id="interrupt-modal-title"
                className="text-sm font-bold text-zinc-900 dark:text-zinc-100"
              >
                Interrupt Task & Incur Takedown Buffer
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Accounting for transition overhead and context switching
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close interruption dialog"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:outline-none transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              Pausing: &ldquo;{task.title}&rdquo;
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Pausing now incurs a{" "}
              <strong className="text-indigo-700 dark:text-indigo-300 font-bold">+{task.takedownMinutes}m takedown buffer</strong>{" "}
              (cleaning up/saving state), and will automatically inject a{" "}
              <strong className="text-blue-700 dark:text-blue-300 font-bold">+{task.setupMinutes}m setup warm-up</strong>{" "}
              when you resume.
            </p>
          </div>

          <div>
            <label
              htmlFor="interruption-reason-input"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Reason for Interruption
            </label>
            <input
              id="interruption-reason-input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ran out of cinnamon, stepped out to store"
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:outline-none"
            />
          </div>

          {/* Quick Select Common Reasons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider block">
              Quick Select Reason:
            </span>
            <div className="space-y-1">
              {commonReasons.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReason(r)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:outline-none"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 flex items-start space-x-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>
              All dependent downstream tasks on the Gantt timeline will automatically cascade forward to maintain realistic schedule accuracy.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:outline-none transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-pink-600 hover:bg-pink-500 text-white transition disabled:opacity-50 shadow-sm focus-visible:ring-2 focus-visible:ring-pink-600 focus-visible:outline-none"
            >
              {isSubmitting ? "Pausing..." : "Pause & Incur Takedown"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
