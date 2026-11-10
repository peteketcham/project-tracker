import type { WorkingCalendarSettings } from "./types";
import { isValidTimeZone, systemTimeZone, zonedParts, zonedTimeToUtc } from "./tz";

const MIN = 60_000;
const DAY = 86_400_000;
/** How far the calendar will look for free time before giving up (two years). */
const SEARCH_DAYS = 730;

export interface Interval {
  start: number; // epoch ms
  end: number;
}

export interface NormalizedCalendar {
  startMinute: number;
  endMinute: number;
  workDays: Set<number>;
  timeZone: string;
}

export function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || h * 60 + min > 1440) return null;
  return h * 60 + min;
}

/** Falls back to 09:00-17:00 Mon-Fri for anything unusable, so the scheduler can never spin. */
export function normalizeCalendar(settings: WorkingCalendarSettings): NormalizedCalendar {
  let startMinute = parseTimeToMinutes(settings.workingHoursStart ?? "");
  let endMinute = parseTimeToMinutes(settings.workingHoursEnd ?? "");
  if (startMinute === null || endMinute === null || endMinute <= startMinute) {
    startMinute = 9 * 60;
    endMinute = 17 * 60;
  }
  let workDays = new Set(
    (settings.workDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
  if (workDays.size === 0) workDays = new Set([1, 2, 3, 4, 5]);
  const timeZone = isValidTimeZone(settings.timezone) ? settings.timezone : systemTimeZone();
  return { startMinute, endMinute, workDays, timeZone };
}

/**
 * Working time = the daily window on working days, minus busy blocks (time off,
 * imported calendar events). All arithmetic is in the configured time zone.
 */
export class WorkCalendar {
  readonly config: NormalizedCalendar;
  private readonly busy: Interval[];
  private readonly cache = new Map<number, Interval[]>();

  constructor(settings: WorkingCalendarSettings) {
    this.config = normalizeCalendar(settings);
    this.busy = (settings.busy ?? [])
      .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
      .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
      .sort((a, b) => a.start - b.start);
  }

  /** Day number (days since 1970-01-01) of the local calendar date containing `ms`. */
  private dayIndex(ms: number): number {
    const p = zonedParts(ms, this.config.timeZone);
    return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY);
  }

  /** Free working intervals on a local calendar day, in order. */
  private free(day: number): Interval[] {
    const cached = this.cache.get(day);
    if (cached) return cached;

    const d = new Date(day * DAY);
    let result: Interval[] = [];
    if (this.config.workDays.has(d.getUTCDay())) {
      const at = (minute: number) =>
        zonedTimeToUtc(
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
          Math.floor(minute / 60),
          minute % 60,
          this.config.timeZone
        );
      result = [{ start: at(this.config.startMinute), end: at(this.config.endMinute) }];
      for (const b of this.busy) {
        if (b.start >= result[result.length - 1]?.end) break;
        result = result.flatMap((iv) => {
          if (b.end <= iv.start || b.start >= iv.end) return [iv];
          const parts: Interval[] = [];
          if (b.start > iv.start) parts.push({ start: iv.start, end: b.start });
          if (b.end < iv.end) parts.push({ start: b.end, end: iv.end });
          return parts;
        });
        if (result.length === 0) break;
      }
    }
    this.cache.set(day, result);
    return result;
  }

  /** `date` if it is inside working time, otherwise the next moment work can start. */
  snapForward(date: Date): Date {
    const t = date.getTime();
    const first = this.dayIndex(t) - 1; // -1 guards against windows near midnight
    for (let i = 0; i <= SEARCH_DAYS; i++) {
      for (const iv of this.free(first + i)) {
        if (iv.end > t) return new Date(Math.max(t, iv.start));
      }
    }
    return new Date(t);
  }

  /** `date` if it is inside working time, otherwise the last moment work could end. */
  snapBackward(date: Date): Date {
    const t = date.getTime();
    const first = this.dayIndex(t) + 1;
    for (let i = 0; i <= SEARCH_DAYS; i++) {
      const ivs = this.free(first - i);
      for (let k = ivs.length - 1; k >= 0; k--) {
        if (ivs[k].start < t) return new Date(Math.min(t, ivs[k].end));
      }
    }
    return new Date(t);
  }

  /** The moment `minutes` of working time after `date` have elapsed. */
  add(date: Date, minutes: number): Date {
    if (minutes <= 0) return new Date(date);
    let cursor = date.getTime();
    let remaining = minutes * MIN;
    const first = this.dayIndex(cursor) - 1;
    for (let i = 0; i <= SEARCH_DAYS; i++) {
      for (const iv of this.free(first + i)) {
        if (iv.end <= cursor) continue;
        const from = Math.max(cursor, iv.start);
        const available = iv.end - from;
        if (remaining <= available) return new Date(from + remaining);
        remaining -= available;
        cursor = iv.end;
      }
    }
    return new Date(cursor + remaining);
  }

  /** The moment from which `minutes` of working time end exactly at `date`. */
  subtract(date: Date, minutes: number): Date {
    if (minutes <= 0) return new Date(date);
    let cursor = date.getTime();
    let remaining = minutes * MIN;
    const first = this.dayIndex(cursor) + 1;
    for (let i = 0; i <= SEARCH_DAYS; i++) {
      const ivs = this.free(first - i);
      for (let k = ivs.length - 1; k >= 0; k--) {
        const iv = ivs[k];
        if (iv.start >= cursor) continue;
        const to = Math.min(cursor, iv.end);
        const available = to - iv.start;
        if (remaining <= available) return new Date(to - remaining);
        remaining -= available;
        cursor = iv.start;
      }
    }
    return new Date(cursor - remaining);
  }

  /** Shift by working minutes in either direction (negative = earlier). */
  shift(date: Date, minutes: number): Date {
    return minutes >= 0 ? this.add(date, minutes) : this.subtract(date, -minutes);
  }

  /** Working minutes from `a` to `b`; negative when `b` is before `a`. */
  between(a: Date, b: Date): number {
    const from = a.getTime();
    const to = b.getTime();
    if (from > to) return -this.between(b, a);
    let total = 0;
    const first = this.dayIndex(from) - 1;
    const last = this.dayIndex(to) + 1;
    for (let day = first; day <= last && day - first <= SEARCH_DAYS; day++) {
      for (const iv of this.free(day)) {
        const overlap = Math.min(iv.end, to) - Math.max(iv.start, from);
        if (overlap > 0) total += overlap;
      }
    }
    return Math.round(total / MIN);
  }
}
