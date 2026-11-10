"use client";

import React, { useState } from "react";
import { Sparkles, LayoutTemplate } from "lucide-react";
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./Modal";

export interface DecomposeMode {
  mode: "model" | "templates";
  model: string | null;
}

interface DecomposeModalProps {
  mode: DecomposeMode;
  onClose: () => void;
  onDecompose: (prompt: string, targetDays: number) => Promise<void>;
}

const SAMPLES = [
  {
    title: "Thanksgiving feast",
    description:
      "Roast 18-lb turkey, blind-bake 2 pies, boil mashed potatoes, make pan gravy, and carve at 4:30 PM",
  },
  {
    title: "Bathroom remodel",
    description:
      "Demo old fixtures, rough-in plumbing, hang waterproof cement board, tile shower, and mount double vanity",
  },
  {
    title: "School spring play",
    description:
      "Cast student roles, sew costumes, construct wooden stage flats, hold dress rehearsal, and opening night",
  },
];

export function DecomposeModal({ mode, onClose, onDecompose }: DecomposeModalProps) {
  const [prompt, setPrompt] = useState("");
  const [targetDays, setTargetDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const usesModel = mode.mode === "model";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onDecompose(prompt, targetDays);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decomposition failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={usesModel ? "AI project decomposition" : "Start from a plan template"} onClose={onClose}>
      <p className="text-xs text-zinc-700 dark:text-zinc-300">
        {usesModel ? (
          <>
            Your description is sent to the configured model (<strong>{mode.model}</strong>), which
            proposes tasks with setup, takedown and unattended time and the links between them.
            The result is validated before anything is saved.
          </>
        ) : (
          <>
            No model is configured, so this picks one of four built-in starter plans (holiday
            dinner, remodel, school play, or a generic five-step plan) by keyword. To use a real
            model, set <code>LLM_BASE_URL</code> and <code>LLM_MODEL</code> in <code>.env</code>, or
            let an agent plan through the MCP server.
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="decompose-prompt" className={labelClass}>
            What project or activity are you planning?
          </label>
          <textarea
            id="decompose-prompt"
            required
            rows={3}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Thanksgiving dinner: turkey, stuffing, mashed potatoes, pies, and table setting"
            className={inputClass}
          />
        </div>

        <div>
          <span className={labelClass}>Examples</span>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.title}
                type="button"
                onClick={() => setPrompt(sample.description)}
                className={secondaryButtonClass}
              >
                {sample.title}
              </button>
            ))}
          </div>
        </div>

        {usesModel && (
          <div>
            <label htmlFor="decompose-days" className={labelClass}>
              Should fit in about {targetDays} working day{targetDays === 1 ? "" : "s"}
            </label>
            <input
              id="decompose-days"
              type="range"
              min="1"
              max="14"
              value={targetDays}
              onChange={(e) => setTargetDays(Number(e.target.value))}
              className="w-full accent-purple-700 focus-visible:ring-2 focus-visible:ring-purple-600"
            />
          </div>
        )}

        {error && (
          <div role="alert" className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-100 text-red-950 dark:bg-red-950/80 dark:text-red-100 border border-red-300 dark:border-red-800">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={loading || !prompt.trim()} className={`${primaryButtonClass} flex items-center gap-1.5`}>
            {usesModel ? (
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <LayoutTemplate className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{loading ? "Working…" : usesModel ? "Generate tasks" : "Create tasks from template"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
