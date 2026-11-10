import { isValidTimeZone, zonedParts, zonedTimeToUtc } from "./scheduler/tz";

/**
 * A small iCalendar (RFC 5545) reader: enough to turn a calendar export into
 * busy blocks. Pure. Supports timed and all-day events, TZID, DURATION, EXDATE,
 * and RRULE with FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL and
 * (for WEEKLY) BYDAY. Anything fancier is counted in `unsupported`, not guessed.
 */

export interface IcsEvent {
  title: string;
  start: Date;
  end: Date;
}

export interface IcsResult {
  events: IcsEvent[];
  /** Events skipped because they use recurrence rules this reader does not handle. */
  unsupported: number;
}

export interface IcsOptions {
  /** Zone for floating times and all-day events. */
  timeZone: string;
  /** Only events overlapping [from, to] are returned; recurrences are expanded inside it. */
  from: Date;
  to: Date;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

interface Moment {
  wall: Wall;
  /** null = UTC */
  zone: string | null;
  allDay: boolean;
}

const DAY = 86_400_000;
const MAX_INSTANCES = 1000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseLine(line: string): Property | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
}

function parseMoment(prop: Property, defaultZone: string): Moment | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value.trim());
  if (!m) return null;
  const wall: Wall = {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: Number(m[4] ?? 0),
    mi: Number(m[5] ?? 0),
    s: Number(m[6] ?? 0),
  };
  const allDay = m[4] === undefined;
  if (m[7] === "Z") return { wall, zone: null, allDay };
  const tzid = prop.params.TZID;
  return { wall, zone: isValidTimeZone(tzid) ? tzid : defaultZone, allDay };
}

function toInstant(m: Moment): number {
  const { y, mo, d, h, mi, s } = m.wall;
  return m.zone === null
    ? Date.UTC(y, mo - 1, d, h, mi, s)
    : zonedTimeToUtc(y, mo, d, h, mi, m.zone, s);
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const ms =
    Number(m[2] ?? 0) * 7 * DAY +
    Number(m[3] ?? 0) * DAY +
    Number(m[4] ?? 0) * 3_600_000 +
    Number(m[5] ?? 0) * 60_000 +
    Number(m[6] ?? 0) * 1000;
  return m[1] === "-" ? -ms : ms;
}

/** Calendar-date arithmetic on wall time (so 09:00 stays 09:00 across DST). */
function addDays(w: Wall, days: number): Wall {
  const d = new Date(Date.UTC(w.y, w.mo - 1, w.d + days));
  return { ...w, y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
function weekday(w: Wall): number {
  return new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay();
}
function validDate(y: number, mo: number, d: number): boolean {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Wall-clock start of each occurrence, in order. Returns null for rules we do not support. */
function* occurrences(start: Moment, rule: Record<string, string>): Generator<Wall> {
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1) || 1);
  const w = start.wall;
  switch (rule.FREQ) {
    case "DAILY":
      for (let i = 0; ; i++) yield addDays(w, i * interval);
    case "WEEKLY": {
      const days = rule.BYDAY
        ? rule.BYDAY.split(",")
            .map((d) => WEEKDAYS.indexOf(d.trim().toUpperCase()))
            .filter((d) => d >= 0)
            .sort((a, b) => a - b)
        : [weekday(w)];
      const weekStart = addDays(w, -weekday(w)); // Sunday of the first week
      for (let week = 0; ; week++) {
        for (const d of days) {
          const candidate = addDays(weekStart, week * interval * 7 + d);
          if (week === 0 && Date.UTC(candidate.y, candidate.mo - 1, candidate.d) < Date.UTC(w.y, w.mo - 1, w.d)) {
            continue;
          }
          yield candidate;
        }
      }
    }
    case "MONTHLY":
      for (let i = 0; ; i++) {
        const total = w.mo - 1 + i * interval;
        const y = w.y + Math.floor(total / 12);
        const mo = (total % 12) + 1;
        if (validDate(y, mo, w.d)) yield { ...w, y, mo };
        if (i > 12 * 200) return;
      }
    case "YEARLY":
      for (let i = 0; i < 200; i++) {
        const y = w.y + i * interval;
        if (validDate(y, w.mo, w.d)) yield { ...w, y };
      }
      return;
  }
}

function ruleSupported(rule: Record<string, string>): boolean {
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.FREQ)) return false;
  const allowed = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "WKST"]);
  if (rule.FREQ === "WEEKLY") allowed.add("BYDAY");
  if (rule.BYDAY && rule.FREQ === "WEEKLY" && /\d/.test(rule.BYDAY)) return false;
  return Object.keys(rule).every((k) => allowed.has(k));
}

export function parseIcs(text: string, options: IcsOptions): IcsResult {
  const zone = isValidTimeZone(options.timeZone) ? options.timeZone : "UTC";
  const from = options.from.getTime();
  const to = options.to.getTime();
  const events: IcsEvent[] = [];
  let unsupported = 0;

  let current: Property[] | null = null;
  for (const line of unfold(text)) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase() === "BEGIN:VEVENT") {
      current = [];
    } else if (trimmed.toUpperCase() === "END:VEVENT") {
      if (current) readEvent(current);
      current = null;
    } else if (current) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, unsupported };

  function readEvent(props: Property[]) {
    const get = (name: string) => props.find((p) => p.name === name);
    const status = get("STATUS")?.value.trim().toUpperCase();
    const transparent = get("TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT";
    if (status === "CANCELLED" || transparent) return; // not busy

    const startProp = get("DTSTART");
    const start = startProp && parseMoment(startProp, zone);
    if (!start) return;
    const startMs = toInstant(start);

    let durationMs: number | null = null;
    const endProp = get("DTEND");
    const end = endProp && parseMoment(endProp, zone);
    if (end) durationMs = toInstant(end) - startMs;
    else if (get("DURATION")) durationMs = parseDuration(get("DURATION")!.value);
    else if (start.allDay) durationMs = DAY;
    if (durationMs === null || durationMs <= 0) return;

    const title = unescapeText(get("SUMMARY")?.value ?? "") || "Busy";
    const push = (s: number) => {
      const e = s + durationMs!;
      if (e > from && s < to) events.push({ title, start: new Date(s), end: new Date(e) });
    };

    const ruleProp = get("RRULE");
    if (!ruleProp) {
      push(startMs);
      return;
    }

    const rule: Record<string, string> = {};
    for (const part of ruleProp.value.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
    }
    if (!ruleSupported(rule)) {
      unsupported += 1;
      return;
    }

    const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
    let until = Infinity;
    if (rule.UNTIL) {
      const u = parseMoment({ name: "UNTIL", params: {}, value: rule.UNTIL }, start.zone ?? zone);
      if (u) until = toInstant(u.allDay ? { ...u, wall: { ...u.wall, h: 23, mi: 59, s: 59 } } : u);
    }
    const excluded = new Set<number>();
    for (const ex of props.filter((p) => p.name === "EXDATE")) {
      for (const value of ex.value.split(",")) {
        const m = parseMoment({ ...ex, value }, zone);
        if (m) excluded.add(toInstant(m));
      }
    }

    let produced = 0;
    for (const wall of occurrences(start, rule)) {
      if (produced >= count || produced >= MAX_INSTANCES) break;
      const s = toInstant({ ...start, wall });
      if (s > until || s >= to) break;
      produced += 1;
      if (!excluded.has(s)) push(s);
    }
  }
}

/** Local calendar date of an instant, as YYYY-MM-DD (handy for all-day labels). */
export function localDate(d: Date, timeZone: string): string {
  const p = zonedParts(d.getTime(), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
