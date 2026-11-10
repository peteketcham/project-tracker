"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, X, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

interface AIDecomposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDecompose: (prompt: string, targetDays: number) => Promise<void>;
}

export function AIDecomposeModal({
  isOpen,
  onClose,
  onDecompose,
}: AIDecomposeModalProps) {
  const [prompt, setPrompt] = useState("");
  const [targetDays, setTargetDays] = useState(5);
  const [loading, setLoading] = useState(false);

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      await onDecompose(prompt, targetDays);
      setPrompt("");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    {
      title: "🦃 Thanksgiving Feast Preparation",
      description: "Roast 18-lb turkey, blind-bake 2 pies, boil mashed potatoes, make pan gravy, and carve at 4:30 PM",
    },
    {
      title: "🛁 Master Bathroom Remodel",
      description: "Demo old fixtures, rough-in plumbing, hang waterproof cement board, tile shower, and mount double vanity",
    },
    {
      title: "🎭 Elementary School Spring Play",
      description: "Cast student roles, sew costumes, construct wooden stage flats, hold dress rehearsal, and opening night",
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-decompose-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white shadow-sm" aria-hidden="true">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="ai-decompose-title"
                className="text-sm font-bold text-zinc-900 dark:text-zinc-100"
              >
                AI Project Decomposition
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Break any real-world goal into sequenced tasks with setup & takedown buffers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI decomposition dialog"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="ai-project-prompt"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5"
            >
              What project or activity are you planning?
            </label>
            <textarea
              id="ai-project-prompt"
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Thanksgiving dinner: turkey, stuffing, mashed potatoes, pies, and table setting"
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none"
            />
          </div>

          {/* Quick Non-Technical Suggestions */}
          <div>
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Quick Suggestions:
            </span>
            <div className="space-y-2">
              {samplePrompts.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(sample.description)}
                  className="w-full text-left p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-zinc-200 dark:border-zinc-700/80 hover:border-purple-300 dark:hover:border-purple-800 transition focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none"
                >
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {sample.title}
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                    {sample.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Target Duration Horizon */}
          <div>
            <label
              htmlFor="ai-target-days"
              className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Estimated Time Horizon: <span className="text-purple-700 dark:text-purple-300 font-bold">{targetDays} Days</span>
            </label>
            <input
              id="ai-target-days"
              type="range"
              min="1"
              max="14"
              value={targetDays}
              onChange={(e) => setTargetDays(Number(e.target.value))}
              aria-valuemin={1}
              aria-valuemax={14}
              aria-valuenow={targetDays}
              className="w-full accent-purple-600 focus-visible:ring-2 focus-visible:ring-purple-600"
            />
          </div>

          {/* Explanatory Box with Accessible Contrast */}
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60 text-xs text-purple-950 dark:text-purple-200 space-y-1">
            <span className="font-bold block">✨ What the scheduler will generate:</span>
            <ul className="list-disc list-inside space-y-0.5 text-zinc-700 dark:text-zinc-300 text-[11px]">
              <li>Decomposes activity into 5–7 sequential steps.</li>
              <li>Injects realistic warm-up/prep time and clean-up/takedown buffers.</li>
              <li>Chains prerequisites (e.g. pies leave oven before turkey roasts).</li>
              <li>Instantly calculates project completion and the critical path.</li>
            </ul>
          </div>

          {/* Actions */}
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
              disabled={loading || !prompt.trim()}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition disabled:opacity-50 shadow-sm focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:outline-none"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{loading ? "Decomposing..." : "Generate Project Tasks"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
