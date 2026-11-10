"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatMinutes } from "@/lib/utils";
import { Modal } from "./Modal";

interface Insights {
  interruptions: {
    total: number;
    last7Days: number;
    overheadMinutesTotal: number;
    overheadMinutesLast7Days: number;
    averageAwayMinutes: number | null;
    byReason: Array<{ reason: string; count: number; overheadMinutes: number }>;
    byWeek: Array<{ weekStart: string; count: number; overheadMinutes: number }>;
    mostInterrupted: Array<{ taskId: string; title: string; count: number; overheadMinutes: number }>;
  };
  focus: { averageStretchMinutes: number | null; stretches: number };
  estimates: {
    sampleSize: number;
    plannedMinutes: number;
    actualMinutes: number;
    ratio: number | null;
    tasks: Array<{ taskId: string; title: string; plannedMinutes: number; actualMinutes: number; ratio: number }>;
    suggestion: string | null;
  };
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
      <dt className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</dt>
      <dd className="text-lg font-bold text-zinc-950 dark:text-zinc-50">{value}</dd>
      {note && <dd className="text-[11px] text-zinc-700 dark:text-zinc-300">{note}</dd>}
    </div>
  );
}

const th = "text-left font-semibold px-2 py-1.5 text-zinc-800 dark:text-zinc-200";
const td = "px-2 py-1.5 text-zinc-900 dark:text-zinc-100";

export function InsightsModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api<Insights>("/api/insights")
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const maxWeek = Math.max(1, ...(data?.interruptions.byWeek.map((w) => w.overheadMinutes) ?? [1]));

  return (
    <Modal title="Insights: what interruptions and estimates really cost" onClose={onClose} wide>
      {error && (
        <div role="alert" className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-100 text-red-950 border border-red-300">
          {error}
        </div>
      )}
      {!data ? (
        !error && <p className="text-sm text-zinc-700 dark:text-zinc-300">Loading…</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat
              label="Interruptions, last 7 days"
              value={String(data.interruptions.last7Days)}
              note={`${data.interruptions.total} all time`}
            />
            <Stat
              label="Switching cost, last 7 days"
              value={formatMinutes(data.interruptions.overheadMinutesLast7Days)}
              note={`${formatMinutes(data.interruptions.overheadMinutesTotal)} all time`}
            />
            <Stat
              label="Average focus stretch"
              value={
                data.focus.averageStretchMinutes === null
                  ? "No data"
                  : formatMinutes(Math.round(data.focus.averageStretchMinutes))
              }
              note={`${data.focus.stretches} measured stretches`}
            />
            <Stat
              label="Actual vs. estimated work"
              value={data.estimates.ratio === null ? "No data" : `${Math.round(data.estimates.ratio * 100)}%`}
              note={`${data.estimates.sampleSize} finished tasks`}
            />
          </dl>

          {data.estimates.suggestion && (
            <p className="text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-950 dark:text-blue-100">
              {data.estimates.suggestion}
            </p>
          )}

          <section aria-labelledby="ins-weeks">
            <h3 id="ins-weeks" className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Switching cost by week
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th scope="col" className={th}>Week of</th>
                  <th scope="col" className={th}>Interruptions</th>
                  <th scope="col" className={th}>Overhead</th>
                  <th scope="col" className={th}><span className="sr-only">Relative size</span></th>
                </tr>
              </thead>
              <tbody>
                {data.interruptions.byWeek.map((w) => (
                  <tr key={w.weekStart} className="border-b border-zinc-100 dark:border-zinc-800/60">
                    <th scope="row" className={`${td} font-medium text-left`}>{w.weekStart}</th>
                    <td className={td}>{w.count}</td>
                    <td className={td}>{formatMinutes(w.overheadMinutes)}</td>
                    <td className="px-2 py-1.5 w-1/2" aria-hidden="true">
                      <div
                        className="h-2.5 rounded bg-pink-700 dark:bg-pink-400"
                        style={{ width: `${(w.overheadMinutes / maxWeek) * 100}%` }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="ins-reasons">
            <h3 id="ins-reasons" className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Why work gets interrupted
            </h3>
            {data.interruptions.byReason.length === 0 ? (
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                No interruptions logged yet. Pause a running task and give a reason to start collecting.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th scope="col" className={th}>Reason</th>
                    <th scope="col" className={th}>Times</th>
                    <th scope="col" className={th}>Overhead</th>
                  </tr>
                </thead>
                <tbody>
                  {data.interruptions.byReason.slice(0, 10).map((r) => (
                    <tr key={r.reason} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <th scope="row" className={`${td} font-medium text-left`}>{r.reason}</th>
                      <td className={td}>{r.count}</td>
                      <td className={td}>{formatMinutes(r.overheadMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.interruptions.averageAwayMinutes !== null && (
              <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-2">
                On average it takes {formatMinutes(Math.round(data.interruptions.averageAwayMinutes))} to get
                back to an interrupted task.
              </p>
            )}
          </section>

          <section aria-labelledby="ins-estimates">
            <h3 id="ins-estimates" className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Estimates vs. measured focused work
            </h3>
            {data.estimates.tasks.length === 0 ? (
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                Nothing to compare yet. Use Start and Done on tasks so their focused time is measured.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th scope="col" className={th}>Finished task</th>
                    <th scope="col" className={th}>Estimated</th>
                    <th scope="col" className={th}>Actual</th>
                    <th scope="col" className={th}>Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.estimates.tasks.map((t) => (
                    <tr key={t.taskId} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <th scope="row" className={`${td} font-medium text-left`}>{t.title}</th>
                      <td className={td}>{formatMinutes(t.plannedMinutes)}</td>
                      <td className={td}>{formatMinutes(t.actualMinutes)}</td>
                      <td className={td}>{Math.round(t.ratio * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-2">
              Only focused work is measured. Setup and takedown are logged at their planned length,
              so they are not compared here.
            </p>
          </section>
        </>
      )}
    </Modal>
  );
}
