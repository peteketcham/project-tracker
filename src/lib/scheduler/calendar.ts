import {
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  addDays,
  subDays,
  getDay,
  isBefore,
  isAfter,
} from "date-fns";
import { WorkingCalendarSettings } from "./types";

export function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function isWorkingDay(date: Date, workDays: number[]): boolean {
  const day = getDay(date); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  return workDays.includes(day);
}

export function getDayWorkingWindow(
  date: Date,
  settings: WorkingCalendarSettings
): { start: Date; end: Date; dailyMinutes: number } {
  const [startH, startM] = settings.workingHoursStart.split(":").map(Number);
  const [endH, endM] = settings.workingHoursEnd.split(":").map(Number);

  const start = setMilliseconds(setSeconds(setMinutes(setHours(date, startH), startM), 0), 0);
  const end = setMilliseconds(setSeconds(setMinutes(setHours(date, endH), endM), 0), 0);
  const dailyMinutes = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));

  return { start, end, dailyMinutes };
}

/**
 * Ensures the date is within working hours.
 * If before working hours or on weekend, moves forward to start of next working period.
 * If after working hours, moves forward to start of next working day.
 */
export function snapToNextWorkingTime(
  date: Date,
  settings: WorkingCalendarSettings
): Date {
  let curr = new Date(date);

  // Maximum search of 14 days to prevent any infinite loop
  for (let i = 0; i < 14; i++) {
    if (!isWorkingDay(curr, settings.workDays)) {
      curr = addDays(curr, 1);
      const { start } = getDayWorkingWindow(curr, settings);
      curr = start;
      continue;
    }

    const { start, end } = getDayWorkingWindow(curr, settings);

    if (isBefore(curr, start)) {
      return start;
    }

    if (isAfter(curr, end) || curr.getTime() === end.getTime()) {
      curr = addDays(curr, 1);
      const nextWindow = getDayWorkingWindow(curr, settings);
      curr = nextWindow.start;
      continue;
    }

    // Inside working hours
    return curr;
  }

  return curr;
}

/**
 * Snaps backward to the latest valid working time.
 */
export function snapToPreviousWorkingTime(
  date: Date,
  settings: WorkingCalendarSettings
): Date {
  let curr = new Date(date);

  for (let i = 0; i < 14; i++) {
    if (!isWorkingDay(curr, settings.workDays)) {
      curr = subDays(curr, 1);
      const { end } = getDayWorkingWindow(curr, settings);
      curr = end;
      continue;
    }

    const { start, end } = getDayWorkingWindow(curr, settings);

    if (isAfter(curr, end)) {
      return end;
    }

    if (isBefore(curr, start) || curr.getTime() === start.getTime()) {
      curr = subDays(curr, 1);
      const prevWindow = getDayWorkingWindow(curr, settings);
      curr = prevWindow.end;
      continue;
    }

    return curr;
  }

  return curr;
}

/**
 * Adds a specified number of working minutes to a start date.
 */
export function addWorkingMinutes(
  startDate: Date,
  minutesToAdd: number,
  settings: WorkingCalendarSettings
): Date {
  if (minutesToAdd <= 0) return new Date(startDate);

  let current = snapToNextWorkingTime(startDate, settings);
  let remainingMinutes = minutesToAdd;

  while (remainingMinutes > 0) {
    const { end } = getDayWorkingWindow(current, settings);
    const availableTodayMinutes = (end.getTime() - current.getTime()) / (1000 * 60);

    if (remainingMinutes <= availableTodayMinutes) {
      return new Date(current.getTime() + remainingMinutes * 60 * 1000);
    }

    remainingMinutes -= availableTodayMinutes;
    // Move to next working day
    current = snapToNextWorkingTime(addDays(end, 1), settings);
  }

  return current;
}

/**
 * Subtracts working minutes from an end date (for backward pass).
 */
export function subtractWorkingMinutes(
  endDate: Date,
  minutesToSubtract: number,
  settings: WorkingCalendarSettings
): Date {
  if (minutesToSubtract <= 0) return new Date(endDate);

  let current = snapToPreviousWorkingTime(endDate, settings);
  let remainingMinutes = minutesToSubtract;

  while (remainingMinutes > 0) {
    const { start } = getDayWorkingWindow(current, settings);
    const availableTodayMinutes = (current.getTime() - start.getTime()) / (1000 * 60);

    if (remainingMinutes <= availableTodayMinutes) {
      return new Date(current.getTime() - remainingMinutes * 60 * 1000);
    }

    remainingMinutes -= availableTodayMinutes;
    current = snapToPreviousWorkingTime(subDays(start, 1), settings);
  }

  return current;
}

/**
 * Calculates total working minutes between two dates.
 */
export function getWorkingMinutesBetween(
  startDate: Date,
  endDate: Date,
  settings: WorkingCalendarSettings
): number {
  if (isAfter(startDate, endDate)) {
    return -getWorkingMinutesBetween(endDate, startDate, settings);
  }

  let current = snapToNextWorkingTime(startDate, settings);
  const target = snapToPreviousWorkingTime(endDate, settings);

  if (isAfter(current, target)) return 0;

  let totalMinutes = 0;

  while (isBefore(current, target)) {
    const { end } = getDayWorkingWindow(current, settings);
    if (isAfter(end, target)) {
      totalMinutes += Math.max(0, (target.getTime() - current.getTime()) / (1000 * 60));
      break;
    } else {
      totalMinutes += Math.max(0, (end.getTime() - current.getTime()) / (1000 * 60));
      current = snapToNextWorkingTime(addDays(end, 1), settings);
    }
  }

  return Math.round(totalMinutes);
}
