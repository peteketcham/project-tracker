"use client";

import React, { useMemo, useState, useRef } from "react";
import { KanbanTask } from "./KanbanBoard";
import {
  format,
  addDays,
  differenceInMinutes,
  startOfDay,
  setHours,
} from "date-fns";
import { formatMinutes } from "@/lib/utils";
import { Flame, Pin } from "lucide-react";

interface GanttChartProps {
  tasks: KanbanTask[];
  dependencies: Array<{
    id: string;
    predecessorId: string;
    successorId: string;
    type: string;
    lagMinutes: number;
  }>;
  onTaskClick: (task: KanbanTask) => void;
  projectStartDate?: string;
  projectEndDate?: string;
}

type ZoomLevel = "hour" | "day" | "week";

export function GanttChart({
  tasks,
  dependencies,
  onTaskClick,
  projectStartDate,
  projectEndDate,
}: GanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("day");
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter scheduled tasks with computed start and end
  const scheduledTasks = useMemo(() => {
    return tasks.filter(
      (t) => t.status !== "BACKLOG" && t.scheduledStart && t.scheduledEnd
    );
  }, [tasks]);

  // Compute timeline boundaries
  const { timelineStart, timelineEnd, totalMinutes, pixelsPerMinute } = useMemo(() => {
    let start = projectStartDate ? new Date(projectStartDate) : new Date();
    let end = projectEndDate ? new Date(projectEndDate) : addDays(start, 5);

    scheduledTasks.forEach((t) => {
      if (t.scheduledStart && new Date(t.scheduledStart) < start) {
        start = new Date(t.scheduledStart);
      }
      if (t.scheduledEnd && new Date(t.scheduledEnd) > end) {
        end = new Date(t.scheduledEnd);
      }
    });

    start = setHours(startOfDay(start), 8);
    end = addDays(end, 2);

    const totalMins = Math.max(600, differenceInMinutes(end, start));

    let ppm = 1;
    if (zoomLevel === "hour") ppm = 2.5;     // 150px per hour
    else if (zoomLevel === "day") ppm = 0.8; // ~48px per hour
    else if (zoomLevel === "week") ppm = 0.25;

    return {
      timelineStart: start,
      timelineEnd: end,
      totalMinutes: totalMins,
      pixelsPerMinute: ppm,
    };
  }, [projectStartDate, projectEndDate, scheduledTasks, zoomLevel]);

  const timelineWidth = Math.max(900, totalMinutes * pixelsPerMinute);
  const rowHeight = 48;
  const headerHeight = 56;
  const sidebarWidth = 280;

  // Generate header columns
  const headerDays = useMemo(() => {
    const days: Array<{ date: Date; left: number; width: number }> = [];
    let curr = new Date(timelineStart);

    while (curr < timelineEnd) {
      const nextDay = addDays(curr, 1);
      const left = differenceInMinutes(curr, timelineStart) * pixelsPerMinute;
      const width = differenceInMinutes(nextDay, curr) * pixelsPerMinute;
      days.push({ date: new Date(curr), left, width });
      curr = nextDay;
    }
    return days;
  }, [timelineStart, timelineEnd, pixelsPerMinute]);

  // Calculate task positions
  const taskCoordinates = useMemo(() => {
    const coords = new Map<
      string,
      {
        left: number;
        width: number;
        setupWidth: number;
        workWidth: number;
        takedownWidth: number;
        y: number;
        task: KanbanTask;
      }
    >();

    scheduledTasks.forEach((task, index) => {
      if (!task.scheduledStart || !task.scheduledEnd) return;

      const taskStart = new Date(task.scheduledStart);
      const taskEnd = new Date(task.scheduledEnd);

      const offsetMinutes = Math.max(0, differenceInMinutes(taskStart, timelineStart));
      const durMinutes = Math.max(20, differenceInMinutes(taskEnd, taskStart));

      const left = offsetMinutes * pixelsPerMinute;
      const width = Math.max(35, durMinutes * pixelsPerMinute);

      const totalPlanned =
        task.totalPlannedDurationMinutes ||
        task.setupMinutes + task.baseDurationMinutes + task.takedownMinutes;

      const setupRatio = task.setupMinutes / totalPlanned;
      const takedownRatio = task.takedownMinutes / totalPlanned;

      const setupWidth = Math.max(8, width * setupRatio);
      const takedownWidth = Math.max(8, width * takedownRatio);
      const workWidth = Math.max(12, width - setupWidth - takedownWidth);

      coords.set(task.id, {
        left,
        width,
        setupWidth,
        workWidth,
        takedownWidth,
        y: headerHeight + index * rowHeight + 10,
        task,
      });
    });

    return coords;
  }, [scheduledTasks, timelineStart, pixelsPerMinute, rowHeight, headerHeight]);

  // Generate dependency arrows
  const dependencyLines = useMemo(() => {
    return dependencies
      .map((dep) => {
        const pred = taskCoordinates.get(dep.predecessorId);
        const succ = taskCoordinates.get(dep.successorId);
        if (!pred || !succ) return null;

        const x1 = pred.left + pred.width;
        const y1 = pred.y + 14;
        const x2 = succ.left;
        const y2 = succ.y + 14;

        const isBothCritical = pred.task.isCritical && succ.task.isCritical;
        const dx = Math.max(20, (x2 - x1) / 2);
        const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        return {
          id: dep.id,
          path,
          isBothCritical,
        };
      })
      .filter(Boolean);
  }, [dependencies, taskCoordinates]);

  return (
    <section
      role="region"
      aria-label="Interactive Gantt Timeline Chart"
      className="flex flex-col h-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs"
    >
      {/* Screen Reader Accessible Table (WCAG 2.1 AA) */}
      <div className="sr-only">
        <h2>Scheduled Tasks Table</h2>
        <table>
          <caption>Timeline schedule breakdown for screen readers</caption>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Scheduled Start</th>
              <th scope="col">Scheduled Finish</th>
              <th scope="col">Focused Duration</th>
              <th scope="col">Setup Time</th>
              <th scope="col">Takedown Time</th>
              <th scope="col">Critical Path</th>
            </tr>
          </thead>
          <tbody>
            {scheduledTasks.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.title}</th>
                <td>{t.scheduledStart ? format(new Date(t.scheduledStart), "PPpp") : "N/A"}</td>
                <td>{t.scheduledEnd ? format(new Date(t.scheduledEnd), "PPpp") : "N/A"}</td>
                <td>{formatMinutes(t.baseDurationMinutes)}</td>
                <td>{t.setupMinutes} min</td>
                <td>{t.takedownMinutes} min</td>
                <td>{t.isCritical ? "Yes (Critical Path)" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gantt Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-zinc-900 dark:text-zinc-100">
            Timeline Engine
          </span>
          <div className="flex items-center space-x-3 text-xs text-zinc-700 dark:text-zinc-300">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-600 border border-blue-700 inline-block" aria-hidden="true" />
              <span>Focused Work</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-xs bg-zinc-400 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:4px_4px] border border-zinc-500 inline-block" aria-hidden="true" />
              <span>Setup / Takedown Buffer</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-xs bg-red-600 ring-2 ring-red-400 inline-block" aria-hidden="true" />
              <span className="font-semibold text-red-900 dark:text-red-300">Critical Path</span>
            </span>
          </div>
        </div>

        {/* Zoom Controls */}
        <div
          role="group"
          aria-label="Timeline zoom scale"
          className="flex items-center bg-zinc-200 dark:bg-zinc-800 p-0.5 rounded-lg text-xs"
        >
          <button
            type="button"
            aria-pressed={zoomLevel === "hour"}
            onClick={() => setZoomLevel("hour")}
            className={`px-2.5 py-1 rounded-md font-bold transition focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
              zoomLevel === "hour"
                ? "bg-white dark:bg-zinc-900 shadow-xs text-zinc-950 dark:text-zinc-50"
                : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100"
            }`}
          >
            Hours
          </button>
          <button
            type="button"
            aria-pressed={zoomLevel === "day"}
            onClick={() => setZoomLevel("day")}
            className={`px-2.5 py-1 rounded-md font-bold transition focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
              zoomLevel === "day"
                ? "bg-white dark:bg-zinc-900 shadow-xs text-zinc-950 dark:text-zinc-50"
                : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100"
            }`}
          >
            Days
          </button>
          <button
            type="button"
            aria-pressed={zoomLevel === "week"}
            onClick={() => setZoomLevel("week")}
            className={`px-2.5 py-1 rounded-md font-bold transition focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
              zoomLevel === "week"
                ? "bg-white dark:bg-zinc-900 shadow-xs text-zinc-950 dark:text-zinc-50"
                : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100"
            }`}
          >
            Weeks
          </button>
        </div>
      </div>

      {/* Main Gantt Body */}
      <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>
        {/* Left Sidebar (Task Names & Meta) */}
        <div
          className="border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 z-20 flex-shrink-0 flex flex-col shadow-xs"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Header */}
          <div
            className="flex items-center px-4 font-bold text-xs text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
            style={{ height: `${headerHeight}px` }}
          >
            <span>Task & Constraints</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-hidden">
            {scheduledTasks.map((task) => (
              <div
                key={task.id}
                tabIndex={0}
                role="button"
                aria-label={`Inspect ${task.title}, duration ${formatMinutes(task.baseDurationMinutes)}${task.isCritical ? ', Critical Path' : ''}`}
                onClick={() => onTaskClick(task)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onTaskClick(task);
                  }
                }}
                onMouseEnter={() => setHoveredTaskId(task.id)}
                onMouseLeave={() => setHoveredTaskId(null)}
                className={`flex items-center justify-between px-3 text-xs border-b border-zinc-200 dark:border-zinc-800/80 cursor-pointer transition hover:bg-zinc-100 dark:hover:bg-zinc-800/60 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
                  hoveredTaskId === task.id ? "bg-zinc-100 dark:bg-zinc-800/80" : ""
                }`}
                style={{ height: `${rowHeight}px` }}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: task.color || "#3b82f6" }}
                    aria-hidden="true"
                  />
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5 flex-shrink-0 pl-2">
                  {task.isCritical && (
                    <Flame className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" aria-label="Critical Path Task" />
                  )}
                  {task.constraintType !== "ASAP" && (
                    <Pin className="w-3.5 h-3.5 text-purple-700 dark:text-purple-300 flex-shrink-0 rotate-45" aria-label={`Pinned constraint: ${task.constraintType}`} />
                  )}
                  <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-semibold">
                    {formatMinutes(task.baseDurationMinutes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Scrollable Timeline Canvas */}
        <div className="flex-1 overflow-x-auto overflow-y-auto relative bg-white dark:bg-zinc-950">
          <div
            style={{
              width: `${timelineWidth}px`,
              minHeight: `${headerHeight + scheduledTasks.length * rowHeight + 80}px`,
            }}
            className="relative"
          >
            {/* Header: Days & Hours */}
            <div
              className="sticky top-0 z-10 flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur"
              style={{ height: `${headerHeight}px`, width: `${timelineWidth}px` }}
            >
              {headerDays.map((col, idx) => (
                <div
                  key={idx}
                  className="border-r border-zinc-200 dark:border-zinc-800 px-2 py-1 flex flex-col justify-between text-xs"
                  style={{ width: `${col.width}px` }}
                >
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {format(col.date, "EEE, MMM d")}
                  </span>
                  <div className="flex justify-between text-[11px] text-zinc-600 dark:text-zinc-400 font-mono">
                    <span>08:00</span>
                    <span>13:00</span>
                    <span>18:00</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Background Grid Lines */}
            <div className="absolute inset-0 top-[56px] pointer-events-none" aria-hidden="true">
              {headerDays.map((col, idx) => (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 border-r border-zinc-100 dark:border-zinc-900"
                  style={{ left: `${col.left + col.width}px` }}
                />
              ))}

              {/* Row Separators */}
              {scheduledTasks.map((_, idx) => (
                <div
                  key={idx}
                  className="absolute left-0 right-0 border-b border-zinc-100 dark:border-zinc-900/80"
                  style={{ top: `${idx * rowHeight}px`, height: `${rowHeight}px` }}
                />
              ))}
            </div>

            {/* SVG Layer for Dependency Lines */}
            <svg
              className="absolute inset-0 pointer-events-none z-10"
              aria-hidden="true"
              style={{
                width: `${timelineWidth}px`,
                height: `${headerHeight + scheduledTasks.length * rowHeight}px`,
              }}
            >
              <defs>
                <marker
                  id="arrow-default"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#64748b" />
                </marker>
                <marker
                  id="arrow-critical"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#dc2626" />
                </marker>
              </defs>

              {dependencyLines.map((line) => {
                if (!line) return null;
                return (
                  <path
                    key={line.id}
                    d={line.path}
                    fill="none"
                    stroke={line.isBothCritical ? "#dc2626" : "#64748b"}
                    strokeWidth={line.isBothCritical ? "2.5" : "1.5"}
                    strokeDasharray={line.isBothCritical ? "none" : "4,3"}
                    markerEnd={`url(#${line.isBothCritical ? "arrow-critical" : "arrow-default"})`}
                  />
                );
              })}
            </svg>

            {/* Interactive Task Bars */}
            {Array.from(taskCoordinates.values()).map(
              ({ left, width, setupWidth, workWidth, takedownWidth, y, task }) => {
                const isHovered = hoveredTaskId === task.id;
                const formattedStart = task.scheduledStart
                  ? format(new Date(task.scheduledStart), "EEE h:mm a")
                  : "";
                const formattedEnd = task.scheduledEnd
                  ? format(new Date(task.scheduledEnd), "EEE h:mm a")
                  : "";

                return (
                  <div
                    key={task.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${task.title}: scheduled from ${formattedStart} to ${formattedEnd}, duration ${formatMinutes(task.baseDurationMinutes)}, plus ${task.setupMinutes}m setup and ${task.takedownMinutes}m takedown buffer${task.isCritical ? ', Critical Path' : ''}. Press Enter to view details.`}
                    onClick={() => onTaskClick(task)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTaskClick(task);
                      }
                    }}
                    onMouseEnter={() => setHoveredTaskId(task.id)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                    style={{
                      left: `${left}px`,
                      top: `${y}px`,
                      width: `${width}px`,
                      height: "30px",
                    }}
                    className={`group absolute rounded-md flex overflow-hidden cursor-pointer shadow-xs transition-all select-none z-20 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${
                      task.isCritical
                        ? "ring-2 ring-red-600 shadow-md shadow-red-500/20"
                        : "ring-1 ring-zinc-400 dark:ring-zinc-700"
                    } ${isHovered ? "scale-[1.02] shadow-lg z-30" : ""}`}
                  >
                    {/* 1. Setup Cap (Warm-up buffer) */}
                    <div
                      style={{ width: `${setupWidth}px` }}
                      className="h-full bg-blue-200 dark:bg-blue-950 border-r border-blue-400 flex items-center justify-center relative overflow-hidden"
                      title={`Setup: ${task.setupMinutes}m prep`}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(#1d4ed8_1px,transparent_1px)] [background-size:4px_4px] opacity-50" aria-hidden="true" />
                      {setupWidth > 22 && (
                        <span className="text-[10px] font-bold text-blue-950 dark:text-blue-200 relative z-10">
                          S
                        </span>
                      )}
                    </div>

                    {/* 2. Core Focused Work Body */}
                    <div
                      style={{
                        width: `${workWidth}px`,
                        backgroundColor: task.color || "#2563eb",
                      }}
                      className="h-full flex items-center px-2 text-white text-xs font-bold truncate relative"
                    >
                      <span className="truncate drop-shadow-xs">{task.title}</span>

                      {task.isCritical && (
                        <Flame className="w-3.5 h-3.5 text-amber-300 ml-1 flex-shrink-0 animate-pulse" aria-hidden="true" />
                      )}

                      {task.constraintType !== "ASAP" && (
                        <Pin className="w-3.5 h-3.5 text-white ml-1 flex-shrink-0 rotate-45" aria-hidden="true" />
                      )}
                    </div>

                    {/* 3. Takedown Cap (Wrap-up buffer) */}
                    <div
                      style={{ width: `${takedownWidth}px` }}
                      className="h-full bg-indigo-200 dark:bg-indigo-950 border-l border-indigo-400 flex items-center justify-center relative overflow-hidden"
                      title={`Takedown: ${task.takedownMinutes}m wrap-up`}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(#4338ca_1px,transparent_1px)] [background-size:4px_4px] opacity-50" aria-hidden="true" />
                      {takedownWidth > 22 && (
                        <span className="text-[10px] font-bold text-indigo-950 dark:text-indigo-200 relative z-10">
                          T
                        </span>
                      )}
                    </div>

                    {/* Hover Tooltip Popup */}
                    {isHovered && (
                      <div
                        role="tooltip"
                        className="absolute bottom-full left-0 mb-2 p-3 rounded-lg bg-zinc-950 text-white text-xs shadow-xl z-50 whitespace-nowrap border border-zinc-700 pointer-events-none"
                      >
                        <div className="font-bold flex items-center space-x-1.5 mb-1 text-zinc-100">
                          <span>{task.title}</span>
                          {task.isCritical && (
                            <span className="text-red-400 font-semibold">(Critical Path)</span>
                          )}
                        </div>
                        <div className="text-zinc-300 space-y-0.5 text-[11px]">
                          <div>
                            Timeline: <span className="text-zinc-100 font-medium">{formattedStart} → {formattedEnd}</span>
                          </div>
                          <div>
                            Focused Work: <strong className="text-white font-bold">{formatMinutes(task.baseDurationMinutes)}</strong>
                          </div>
                          <div className="text-blue-300 font-medium">
                            Setup Prep: +{task.setupMinutes}m | Takedown Clean: +{task.takedownMinutes}m
                          </div>
                          {task.totalFloatMinutes !== null && (
                            <div className="text-zinc-400">
                              Schedule Float: {task.totalFloatMinutes}m
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
