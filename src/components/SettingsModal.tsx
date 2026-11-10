"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Modal, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./Modal";

interface Settings {
  workingHoursStart: string;
  workingHoursEnd: string;
  workDays: string;
  timezone: string | null;
  levelResources: boolean;
  projectStartDate: string | null;
  systemTimeZone: string;
  icsUrlConfigured: boolean;
}

interface TimeOff {
  id: string;
  title: string;
  start: string;
  end: string;
  source: string;
}

interface ImportResult {
  imported: number;
  unsupported: number;
  truncated: number;
  windowDays: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toLocalInput = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";

interface SettingsModalProps {
  onClose: () => void;
  /** Called after anything that changes the schedule. */
  onChanged: () => void;
}

export function SettingsModal({ onClose, onChanged }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // New time-off form
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [icsUrl, setIcsUrl] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([api<Settings>("/api/settings"), api<TimeOff[]>("/api/time-off")])
      .then(([s, t]) => {
        if (!alive) return;
        setSettings(s);
        setTimeOff(t);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const act = useCallback(
    async (work: () => Promise<string>) => {
      setBusy(true);
      setError("");
      setMessage("");
      try {
        setMessage(await work());
        setTimeOff(await api<TimeOff[]>("/api/time-off"));
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [onChanged]
  );

  const describeImport = (r: ImportResult) =>
    `Imported ${r.imported} busy block${r.imported === 1 ? "" : "s"} for the next ${r.windowDays} days.` +
    (r.unsupported ? ` ${r.unsupported} repeating event(s) use rules that are not supported and were skipped.` : "") +
    (r.truncated ? ` ${r.truncated} event(s) beyond the limit were left out.` : "");

  const workDays = new Set((settings?.workDays ?? "").split(",").filter(Boolean).map(Number));
  const patch = (p: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...p } : s));

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    void act(async () => {
      const saved = await api<Settings>("/api/settings", "PUT", {
        workingHoursStart: settings.workingHoursStart,
        workingHoursEnd: settings.workingHoursEnd,
        workDays: [...workDays],
        timezone: settings.timezone || null,
        levelResources: settings.levelResources,
        projectStartDate: settings.projectStartDate,
      });
      setSettings(saved);
      return "Settings saved. Schedule recalculated.";
    });
  };

  const addTimeOff = (e: React.FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await api("/api/time-off", "POST", {
        title,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
      setTitle("");
      setStart("");
      setEnd("");
      return "Time off added.";
    });
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    void act(async () =>
      describeImport(await api<ImportResult>("/api/time-off/import", "POST", { ics: await file.text() }))
    );
  };

  return (
    <Modal title="Settings & Calendar" onClose={onClose} wide>
      <div role="status" aria-live="polite" className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 min-h-4">
        {message}
      </div>
      {error && (
        <div role="alert" className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-100 text-red-950 dark:bg-red-950/80 dark:text-red-100 border border-red-300 dark:border-red-800">
          {error}
        </div>
      )}

      {!settings ? (
        !error && <p className="text-sm text-zinc-700 dark:text-zinc-300">Loading settings…</p>
      ) : (
        <>
          <form onSubmit={saveSettings} className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Working time</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="set-start" className={labelClass}>Day starts</label>
                <input
                  id="set-start"
                  type="time"
                  required
                  value={settings.workingHoursStart}
                  onChange={(e) => patch({ workingHoursStart: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="set-end" className={labelClass}>Day ends</label>
                <input
                  id="set-end"
                  type="time"
                  required
                  value={settings.workingHoursEnd}
                  onChange={(e) => patch({ workingHoursEnd: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="set-tz" className={labelClass}>Time zone</label>
                <input
                  id="set-tz"
                  type="text"
                  value={settings.timezone ?? ""}
                  onChange={(e) => patch({ timezone: e.target.value })}
                  placeholder={settings.systemTimeZone}
                  aria-describedby="set-tz-help"
                  className={inputClass}
                />
                <span id="set-tz-help" className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 block">
                  IANA name, e.g. America/Chicago. Empty uses the server&apos;s zone.
                </span>
              </div>
            </div>

            <fieldset>
              <legend className={labelClass}>Working days</legend>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((name, day) => (
                  <label key={name} className="flex items-center gap-1.5 text-xs text-zinc-800 dark:text-zinc-200">
                    <input
                      type="checkbox"
                      checked={workDays.has(day)}
                      onChange={(e) => {
                        const next = new Set(workDays);
                        if (e.target.checked) next.add(day);
                        else next.delete(day);
                        patch({ workDays: [...next].sort().join(",") });
                      }}
                      className="w-4 h-4 focus-visible:ring-2 focus-visible:ring-blue-600"
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="set-project-start" className={labelClass}>Plan starts no earlier than</label>
                <input
                  id="set-project-start"
                  type="datetime-local"
                  value={toLocalInput(settings.projectStartDate)}
                  onChange={(e) =>
                    patch({ projectStartDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                  aria-describedby="set-project-start-help"
                  className={inputClass}
                />
                <span id="set-project-start-help" className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 block">
                  Optional. Unstarted work is never planned before now either way.
                </span>
              </div>
              <label className="flex items-start gap-2 text-xs text-zinc-800 dark:text-zinc-200 sm:mt-5">
                <input
                  type="checkbox"
                  checked={settings.levelResources}
                  onChange={(e) => patch({ levelResources: e.target.checked })}
                  className="w-4 h-4 mt-0.5 focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <span>
                  <strong>One thing at a time per person.</strong> Turn off to plan as if everything
                  could happen in parallel.
                </span>
              </label>
            </div>

            <button type="submit" disabled={busy} className={primaryButtonClass}>
              Save settings
            </button>
          </form>

          <section aria-labelledby="timeoff-heading" className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <h3 id="timeoff-heading" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Time off & busy blocks
            </h3>

            {timeOff.length === 0 ? (
              <p className="text-xs text-zinc-700 dark:text-zinc-300">Nothing blocked out.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {timeOff.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                  >
                    <span className="text-zinc-900 dark:text-zinc-100">
                      <strong>{t.title}</strong>{" "}
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {format(new Date(t.start), "EEE MMM d, h:mm a")} – {format(new Date(t.end), "EEE MMM d, h:mm a")}
                      </span>
                      {t.source === "ICS" && (
                        <span className="ml-2 px-1.5 py-0.5 rounded border border-zinc-400 dark:border-zinc-600 text-[10px] font-bold">
                          imported
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api(`/api/time-off/${t.id}`, "DELETE");
                          return `Removed "${t.title}".`;
                        })
                      }
                      aria-label={`Remove ${t.title}`}
                      className="p-1 rounded text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={addTimeOff} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label htmlFor="off-title" className={labelClass}>What</label>
                <input id="off-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dentist" className={inputClass} />
              </div>
              <div>
                <label htmlFor="off-start" className={labelClass}>From</label>
                <input id="off-start" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="off-end" className={labelClass}>Until</label>
                <input id="off-end" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
              </div>
              <button type="submit" disabled={busy} className={secondaryButtonClass}>
                Add time off
              </button>
            </form>

            <div className="space-y-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Import a calendar (.ics)</h4>
              <p className="text-[11px] text-zinc-700 dark:text-zinc-300">
                Busy events for the next six months become busy blocks. Importing again replaces the
                previous import; time off you added by hand is kept.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                <div>
                  <label htmlFor="ics-file" className={labelClass}>From a file</label>
                  <input
                    id="ics-file"
                    type="file"
                    accept=".ics,text/calendar"
                    disabled={busy}
                    onChange={(e) => {
                      importFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    className={inputClass}
                  />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () =>
                      describeImport(await api<ImportResult>("/api/time-off/import", "POST", { url: icsUrl }))
                    );
                  }}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1">
                    <label htmlFor="ics-url" className={labelClass}>From an address</label>
                    <input id="ics-url" type="url" required value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} placeholder="https://…/calendar.ics" className={inputClass} />
                  </div>
                  <button type="submit" disabled={busy} className={secondaryButtonClass}>
                    Import
                  </button>
                </form>
              </div>
              {settings.icsUrlConfigured && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () =>
                      describeImport(await api<ImportResult>("/api/time-off/import", "POST", { useConfigured: true }))
                    )
                  }
                  className={secondaryButtonClass}
                >
                  Refresh from configured calendar
                </button>
              )}
            </div>
          </section>

          <section aria-labelledby="backup-heading" className="space-y-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <h3 id="backup-heading" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Backup
            </h3>
            <p className="text-[11px] text-zinc-700 dark:text-zinc-300">
              Everything lives in one SQLite file on this machine. Download a copy now and then.
              Restoring replaces <strong>all</strong> current tasks, history, time off and baselines.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <a href="/api/export" download className={secondaryButtonClass}>
                Download backup (.json)
              </a>
              <div>
                <label htmlFor="restore-file" className={labelClass}>Restore from a backup file</label>
                <input
                  id="restore-file"
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (!confirm("Replace everything in the tracker with this backup? This cannot be undone.")) return;
                    void act(async () => {
                      let parsed: unknown;
                      try {
                        parsed = JSON.parse(await file.text());
                      } catch {
                        throw new Error("That file is not valid JSON.");
                      }
                      const r = await api<{ restored: { tasks: number } }>("/api/import", "POST", {
                        confirm: "REPLACE_ALL",
                        data: parsed,
                      });
                      setSettings(await api<Settings>("/api/settings"));
                      return `Restored ${r.restored.tasks} tasks from the backup.`;
                    });
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </Modal>
  );
}
