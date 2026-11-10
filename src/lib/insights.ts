/**
 * What the logged sessions and interruptions say about how the work really goes.
 * Pure: takes plain records and `now`.
 *
 * Only measured data is used. Focused-work sessions are measured (start to
 * pause/complete); setup and takedown sessions are recorded at their planned
 * length, so this report does not pretend to calibrate them.
 */

export interface InsightTask {
  id: string;
  title: string;
  status: string;
  baseDurationMinutes: number;
  workSessions: Array<{
    sessionType: string;
    startTime: Date;
    endTime: Date | null;
    durationMinutes: number;
  }>;
  interruptionLogs: Array<{
    pausedAt: Date;
    resumedAt: Date | null;
    reason: string | null;
    overheadAddedMinutes: number;
  }>;
}

export interface InsightsReport {
  generatedAt: Date;
  interruptions: {
    total: number;
    last7Days: number;
    overheadMinutesTotal: number;
    overheadMinutesLast7Days: number;
    /** Average minutes between pausing and resuming, for interruptions that were resumed. */
    averageAwayMinutes: number | null;
    byReason: Array<{ reason: string; count: number; overheadMinutes: number }>;
    byWeek: Array<{ weekStart: string; count: number; overheadMinutes: number }>;
    mostInterrupted: Array<{ taskId: string; title: string; count: number; overheadMinutes: number }>;
  };
  focus: {
    /** Average length of a focused-work stretch before it was paused or finished. */
    averageStretchMinutes: number | null;
    stretches: number;
  };
  estimates: {
    /** Finished tasks that have measured focused work. */
    sampleSize: number;
    plannedMinutes: number;
    actualMinutes: number;
    /** actual / planned; 1.25 means work takes 25% longer than estimated. */
    ratio: number | null;
    tasks: Array<{
      taskId: string;
      title: string;
      plannedMinutes: number;
      actualMinutes: number;
      ratio: number;
    }>;
    suggestion: string | null;
  };
}

const DAY = 86_400_000;
const WEEKS = 8;

function mondayOf(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc;
}

function normalizeReason(reason: string | null): string {
  const r = (reason ?? "").trim().replace(/\s+/g, " ");
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : "No reason given";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeInsights(tasks: InsightTask[], now: Date): InsightsReport {
  const weekAgo = now.getTime() - 7 * DAY;

  let total = 0;
  let last7 = 0;
  let overheadTotal = 0;
  let overheadLast7 = 0;
  const away: number[] = [];
  const reasons = new Map<string, { reason: string; count: number; overheadMinutes: number }>();
  const perTask: InsightsReport["interruptions"]["mostInterrupted"] = [];

  const thisWeek = mondayOf(now).getTime();
  const weeks = new Map<number, { count: number; overheadMinutes: number }>();
  for (let i = WEEKS - 1; i >= 0; i--) weeks.set(thisWeek - i * 7 * DAY, { count: 0, overheadMinutes: 0 });

  const stretches: number[] = [];
  const estimateRows: InsightsReport["estimates"]["tasks"] = [];

  for (const task of tasks) {
    let taskOverhead = 0;
    for (const log of task.interruptionLogs) {
      total += 1;
      overheadTotal += log.overheadAddedMinutes;
      taskOverhead += log.overheadAddedMinutes;
      if (log.pausedAt.getTime() >= weekAgo) {
        last7 += 1;
        overheadLast7 += log.overheadAddedMinutes;
      }
      if (log.resumedAt) away.push((log.resumedAt.getTime() - log.pausedAt.getTime()) / 60_000);

      const reason = normalizeReason(log.reason);
      const key = reason.toLowerCase();
      const entry = reasons.get(key) ?? { reason, count: 0, overheadMinutes: 0 };
      entry.count += 1;
      entry.overheadMinutes += log.overheadAddedMinutes;
      reasons.set(key, entry);

      const week = weeks.get(mondayOf(log.pausedAt).getTime());
      if (week) {
        week.count += 1;
        week.overheadMinutes += log.overheadAddedMinutes;
      }
    }
    if (task.interruptionLogs.length > 0) {
      perTask.push({
        taskId: task.id,
        title: task.title,
        count: task.interruptionLogs.length,
        overheadMinutes: taskOverhead,
      });
    }

    const closedWork = task.workSessions.filter(
      (s) => s.sessionType === "WORK" && s.endTime && s.durationMinutes > 0
    );
    for (const s of closedWork) stretches.push(s.durationMinutes);

    if (task.status === "DONE" && closedWork.length > 0 && task.baseDurationMinutes > 0) {
      const actual = closedWork.reduce((sum, s) => sum + s.durationMinutes, 0);
      estimateRows.push({
        taskId: task.id,
        title: task.title,
        plannedMinutes: task.baseDurationMinutes,
        actualMinutes: actual,
        ratio: round1(actual / task.baseDurationMinutes),
      });
    }
  }

  const planned = estimateRows.reduce((s, r) => s + r.plannedMinutes, 0);
  const actual = estimateRows.reduce((s, r) => s + r.actualMinutes, 0);
  const ratio = planned > 0 ? Math.round((actual / planned) * 100) / 100 : null;

  let suggestion: string | null = null;
  if (ratio !== null && estimateRows.length >= 3) {
    if (ratio >= 1.15) {
      suggestion = `Focused work has taken about ${Math.round((ratio - 1) * 100)}% longer than estimated. Consider multiplying new estimates by ${ratio.toFixed(2)}.`;
    } else if (ratio <= 0.85) {
      suggestion = `Focused work has taken about ${Math.round((1 - ratio) * 100)}% less than estimated. You can afford tighter estimates.`;
    } else {
      suggestion = "Your focused-work estimates are within 15% of what actually happened.";
    }
  }

  const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  return {
    generatedAt: now,
    interruptions: {
      total,
      last7Days: last7,
      overheadMinutesTotal: overheadTotal,
      overheadMinutesLast7Days: overheadLast7,
      averageAwayMinutes: avg(away),
      byReason: [...reasons.values()].sort(
        (a, b) => b.overheadMinutes - a.overheadMinutes || b.count - a.count
      ),
      byWeek: [...weeks.entries()].map(([start, v]) => ({
        weekStart: new Date(start).toISOString().slice(0, 10),
        ...v,
      })),
      mostInterrupted: perTask.sort((a, b) => b.count - a.count).slice(0, 5),
    },
    focus: { averageStretchMinutes: avg(stretches), stretches: stretches.length },
    estimates: {
      sampleSize: estimateRows.length,
      plannedMinutes: planned,
      actualMinutes: actual,
      ratio,
      tasks: estimateRows.sort((a, b) => b.ratio - a.ratio).slice(0, 20),
      suggestion,
    },
  };
}
