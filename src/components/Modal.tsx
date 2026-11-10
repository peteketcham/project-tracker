"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

/** Accessible dialog shell: labelled, modal, closes on Escape, takes focus when opened. */
export function Modal({ title, onClose, children, wide }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose without re-running the focus effect on every parent render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full ${wide ? "max-w-3xl" : "max-w-2xl"} bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-8 focus:outline-none`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          <h2 id={titleId} className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export const inputClass =
  "w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none";
export const labelClass = "block text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1";
export const primaryButtonClass =
  "px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-600 text-white transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 focus-visible:outline-none";
export const secondaryButtonClass =
  "px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none";
