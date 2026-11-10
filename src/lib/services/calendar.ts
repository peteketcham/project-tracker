import { prisma } from "../prisma";
import { ApiError } from "../errors";
import { parseIcs } from "../ics";
import { systemTimeZone } from "../scheduler/tz";
import type { SettingsUpdateInput, TimeOffInput } from "../validation";
import { getSettingsRow } from "./schedule";

const DAY = 86_400_000;
const IMPORT_WINDOW_DAYS = 180;
const MAX_ICS_BYTES = 2_000_000;
const MAX_IMPORTED_EVENTS = 2000;

export async function getSettings() {
  const settings = await getSettingsRow();
  return {
    ...settings,
    systemTimeZone: systemTimeZone(),
    icsUrlConfigured: Boolean(process.env.ICS_URL),
  };
}

export async function updateSettings(input: SettingsUpdateInput) {
  await getSettingsRow();
  const { workDays, ...rest } = input;
  await prisma.projectSettings.update({
    where: { id: "default" },
    data: { ...rest, workDays: workDays.join(",") },
  });
  return getSettings();
}

/* ---------------------------------------------------------------- time off */

/** Upcoming and recent time off, oldest first. */
export function listTimeOff(now: Date = new Date()) {
  return prisma.timeOff.findMany({
    where: { end: { gte: new Date(now.getTime() - DAY) } },
    orderBy: { start: "asc" },
  });
}

export function addTimeOff(input: TimeOffInput) {
  return prisma.timeOff.create({ data: { ...input, source: "MANUAL" } });
}

export async function removeTimeOff(id: string) {
  await prisma.timeOff.delete({ where: { id } });
  return { success: true, id };
}

/* -------------------------------------------------------------- ICS import */

async function fetchIcs(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl.replace(/^webcal:/i, "https:"));
  } catch {
    throw new ApiError(400, "That is not a valid calendar address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(400, "Calendar address must be http, https or webcal");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/calendar, text/plain;q=0.5" },
    });
  } catch {
    throw new ApiError(502, "Could not reach the calendar address");
  }
  if (!res.ok) throw new ApiError(502, `The calendar address answered ${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_ICS_BYTES) throw new ApiError(413, "That calendar is too large");
  const text = await res.text();
  if (text.length > MAX_ICS_BYTES) throw new ApiError(413, "That calendar is too large");
  return text;
}

/**
 * Replaces all previously imported busy blocks with the events in the given
 * calendar for the next six months. Manual time off is untouched.
 */
export async function importIcs(
  source: { ics?: string; url?: string; useConfigured?: boolean },
  now: Date = new Date()
) {
  let text: string;
  if (source.ics !== undefined) text = source.ics;
  else if (source.url) text = await fetchIcs(source.url);
  else if (process.env.ICS_URL) text = await fetchIcs(process.env.ICS_URL);
  else throw new ApiError(400, "No ICS_URL is configured on the server");

  // Never echo fetched content back: only parsed events are stored or returned.
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new ApiError(400, "That does not look like an iCalendar (.ics) file");
  }

  const settings = await getSettingsRow();
  const { events, unsupported } = parseIcs(text, {
    timeZone: settings.timezone ?? systemTimeZone(),
    from: now,
    to: new Date(now.getTime() + IMPORT_WINDOW_DAYS * DAY),
  });
  const kept = events.slice(0, MAX_IMPORTED_EVENTS);

  await prisma.$transaction([
    prisma.timeOff.deleteMany({ where: { source: "ICS" } }),
    prisma.timeOff.createMany({
      data: kept.map((e) => ({
        title: e.title.slice(0, 200),
        start: e.start,
        end: e.end,
        source: "ICS",
      })),
    }),
  ]);

  return {
    imported: kept.length,
    unsupported,
    truncated: events.length - kept.length,
    windowDays: IMPORT_WINDOW_DAYS,
  };
}
