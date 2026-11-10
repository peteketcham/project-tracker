# SPECIFICATION: Time-Aware Agile Project Tracker & Reactive Gantt Engine
**Speckit Format Version**: 2.1  
**Target Execution Engines**: Antigravity, Claude Code, Cursor, Human Developers  
**Repository**: `/Users/peteketcham/git/project-tracker`  
**Compliance Standard**: WCAG 2.1 Level AA  

---

## 1. System Vision & Core Intent

### 1.1 Problem Statement
Traditional agile tools (Jira, Trello, Linear) treat task duration as static point estimates or loose due dates without modeling the actual physics of time:
1. **Context-Switching Friction**: Whenever a human is interrupted or pauses a task, they incur a measurable **takedown penalty** (saving progress, stashing state) and a subsequent **setup warm-up penalty** (rebuilding mental context, loading tools).
2. **Calendar Inelasticity**: Tasks do not progress 24/7; they must respect daily working windows (e.g., 08:00–18:00) and weekends.
3. **Lack of Dynamic Cascade**: Moving or delaying a prerequisite task often fails to automatically cascade to dependent tasks with critical path visibility.

### 1.2 System Purpose
A personal and high-leverage time management tool that combines:
- An intuitive Jira-style Kanban board.
- A deterministic, constraint-based **Critical Path Method (CPM)** reactive scheduler.
- A dual visual experience featuring an interactive, multi-segmented **Gantt Chart** and a **Kanban Board**.
- A native **Model Context Protocol (MCP) Server** enabling AI agents (Antigravity, Claude Code) to inspect, decompose, pin, and manipulate schedules programmatically.

---

## 2. Mathematical Models & Scheduling Engine Specifications

### 2.1 The Interruption & Context-Switching Formula
Let:
- $D$ = Base focused productive work duration (minutes).
- $S$ = Setup warm-up buffer (minutes).
- $T$ = Takedown wrap-up buffer (minutes).
- $k$ = Number of recorded task interruptions ($k \ge 0$).

When executed in a single uninterrupted session ($k = 0$):
$$\text{Total Planned Duration} = S + D + T$$

When interrupted $k$ times into $k + 1$ discrete work sessions:
$$\text{Effective Duration} = (k + 1) \cdot S + D + (k + 1) \cdot T$$

**Overhead Added per Interruption Event**:
$$\Delta_{\text{overhead}} = S + T$$
When an active task is paused:
1. Active work session closes at $t_{\text{pause}}$.
2. A takedown session of duration $T$ is registered.
3. Task status changes to `PAUSED`.
4. Downstream successor tasks automatically slip forward by $T + \text{Remaining Work} + S$.

### 2.2 Working Calendar Wrapping Algorithm
Let working hours be defined by interval $[H_{\text{start}}, H_{\text{end}}]$ on valid working days $W \subseteq \{0, 1, 2, 3, 4, 5, 6\}$.
- **Forward Step**: Adding $M$ minutes to date $t$:
  1. Snap $t$ to next valid working window if $t$ falls outside $[H_{\text{start}}, H_{\text{end}}]$ or on non-work days.
  2. Compute available minutes today: $M_{\text{avail}} = \text{endOfDayWorkingWindow} - t$.
  3. If $M \le M_{\text{avail}}$, return $t + M$.
  4. If $M > M_{\text{avail}}$, advance date to $H_{\text{start}}$ of next working day and recurse with $M - M_{\text{avail}}$.
- **Backward Step**: Subtracting $M$ minutes from deadline $t$ follows the symmetric inverse operation.

### 2.3 Dependency Graph & Critical Path Method (CPM)
Tasks form a Directed Acyclic Graph (DAG) $G = (V, E)$.
1. **Topological Sort**: Kahn's algorithm detects cycles. If a cycle exists, flag `hasCycle = true` and alert the user.
2. **Forward Pass (Early Dates)**:
   - For root tasks: $\text{ES}_i = \max(\text{ProjectStart}, \text{PinnedConstraint}_i)$.
   - For dependent tasks with predecessor $p$:
     - **Finish-to-Start (FS)**: $\text{ES}_i \ge \text{EF}_p + \text{lag}$
     - **Start-to-Start (SS)**: $\text{ES}_i \ge \text{ES}_p + \text{lag}$
     - **Finish-to-Finish (FF)**: $\text{EF}_i \ge \text{EF}_p + \text{lag}$
     - **Start-to-Finish (SF)**: $\text{EF}_i \ge \text{ES}_p + \text{lag}$
   - $\text{EF}_i = \text{addWorkingMinutes}(\text{ES}_i, \text{TotalPlannedDuration}_i)$.
3. **Backward Pass (Late Dates & Slack)**:
   - Set $\text{ProjectEnd} = \max_i(\text{EF}_i)$.
   - For each task in reverse topological order:
     - $\text{LF}_i = \min(\text{Successor Late Constraints}, \text{Pinned Deadline}_i)$.
     - $\text{LS}_i = \text{subtractWorkingMinutes}(\text{LF}_i, \text{TotalPlannedDuration}_i)$.
     - $\text{Total Float}_i = \text{getWorkingMinutesBetween}(\text{ES}_i, \text{LS}_i)$.
4. **Critical Path Identification**:
   - A task is on the critical path iff $\text{Total Float}_i \le 15\text{ minutes}$ and $\text{Status}_i \ne \text{DONE}$.

---

## 3. System Architecture & Tech Stack

```
+---------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                  |
|   +--------------------------+  +--------------------------+  +---------------+ |
|   |   Kanban Board View      |  |   Gantt Chart (SVG)      |  | Accessibility | |
|   |  - HTML5 Drag & Drop     |  |  - Zoom: Hour/Day/Week   |  | - WCAG 2.1 AA | |
|   |  - Status Actions        |  |  - Bezier Links (FS,SS)  |  | - Live Region | |
|   |  - Time Chips & Buffers  |  |  - S/Work/T Segmented    |  | - Skip Link   | |
|   +--------------------------+  +--------------------------+  +---------------+ |
+----------------------------------------+----------------------------------------+
                                         | Next.js App Router (React 19 / TypeScript)
                                         v
+---------------------------------------------------------------------------------+
|                                 BACKEND / APIS                                  |
|   /api/tasks          /api/dependencies      /api/sessions     /api/ai-decompose|
+----------------------------------------+----------------------------------------+
                                         | Prisma ORM 6
                                         v
+---------------------------------------------------------------------------------+
|                                PERSISTENCE LAYER                                |
|                        SQLite Database (prisma/dev.db)                          |
+---------------------------------------------------------------------------------+
                                         ^
                                         | JSON-RPC (stdio transport)
+----------------------------------------+----------------------------------------+
|                                MCP AI SERVER                                    |
|   src/mcp/server.ts (@modelcontextprotocol/sdk)                                 |
|   Available to: Claude Code, Antigravity Agent, Cursor, Terminal CLI            |
+---------------------------------------------------------------------------------+
```

### Component Stack
- **Framework**: Next.js 16 (App Router, React 19, TypeScript).
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss` and `postcss.config.js`.
- **Database**: SQLite via Prisma ORM 6 (`prisma/schema.prisma`).
- **Icons**: `lucide-react`.
- **Date Library**: `date-fns` v4.
- **AI Integration**: `@modelcontextprotocol/sdk` (Model Context Protocol).

---

## 4. Entity Schema & Data Contract

### Task
| Field | Type | Description |
|---|---|---|
| `id` | String (CUID) | Primary Key |
| `title` | String | Task name |
| `description` | String? | Detailed description, notes |
| `status` | Enum | `BACKLOG`, `SCHEDULED`, `IN_PROGRESS`, `PAUSED`, `DONE` |
| `priority` | Enum | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `baseDurationMinutes` | Int | Pure productive focused work (default: 60) |
| `setupMinutes` | Int | Warm-up / prep buffer (default: 15) |
| `takedownMinutes` | Int | Wrap-up / clean buffer (default: 10) |
| `constraintType` | Enum | `ASAP`, `ALAP`, `MUST_START_ON`, `MUST_FINISH_ON`, `START_NO_EARLIER_THAN`, `FINISH_NO_LATER_THAN` |
| `pinnedDate` | DateTime? | Fixed target date for constraint |
| `scheduledStart` | DateTime? | Computed Early Start (ES) |
| `scheduledEnd` | DateTime? | Computed Early Finish (EF) |
| `actualStart` | DateTime? | Timestamp when task entered IN_PROGRESS |
| `actualEnd` | DateTime? | Timestamp when task entered DONE |
| `color` | String | Hex color string |
| `order` | Int | Display sequence order |

### TaskDependency
| Field | Type | Description |
|---|---|---|
| `id` | String (CUID) | Primary Key |
| `predecessorId` | String (FK) | Prerequisite task |
| `successorId` | String (FK) | Dependent task |
| `type` | Enum | `FS` (Finish-to-Start), `SS` (Start-to-Start), `FF` (Finish-to-Finish), `SF` (Start-to-Finish) |
| `lagMinutes` | Int | Buffer or lead time in minutes |

### WorkSession & InterruptionLog
- **`WorkSession`**: Tracks actual intervals of `SETUP`, `WORK`, and `TAKEDOWN` with duration in minutes.
- **`InterruptionLog`**: Records timestamp of pause, text reason, and calculated overhead penalty.

---

## 5. Model Context Protocol (MCP) Server Interface

The MCP server runs over `stdio` via `npm run mcp` (`src/mcp/server.ts`).

### Tools Declared
1. **`list_tasks`**: Returns all tasks, statuses, durations, and dependencies in JSON format.
2. **`create_task`**: Creates a single task with base duration, setup/takedown buffers, priority, and date constraints.
3. **`bulk_decompose_project`**: Accepts an array of tasks and dependencies; atomically inserts them and returns calculated critical path schedule.
4. **`add_dependency`**: Links two tasks with dependency type (`FS`, `SS`, `FF`, `SF`) and lag.
5. **`pin_task`**: Sets constraint type (`MUST_START_ON`, `MUST_FINISH_ON`, `SNET`, `FNLT`) and ISO timestamp.
6. **`get_schedule_summary`**: Computes and returns project start/end, critical bottleneck tasks, and slack.
7. **`track_work_session`**: Triggers state transitions (`START`, `PAUSE`, `RESUME`, `COMPLETE`) with interruption reasons.

---

## 6. Accessibility Specification (WCAG 2.1 Level AA)

Every user interface component must adhere to the following strict accessibility contracts:

1. **Perceivable**:
   - **Contrast Ratio**: All text elements must achieve $\ge 4.5:1$ contrast against their parent background (e.g. `text-red-950 bg-red-100 border-red-300`).
   - **Color Independence**: Status, priority, and critical path cannot be indicated by color alone; every badge must include text and/or an icon with an aria-label.
   - **Accessible Gantt Fallback**: Screen readers cannot parse horizontal SVG coordinates. An accessible summary table (`<table className="sr-only">`) must always be rendered alongside the SVG canvas.
2. **Operable**:
   - **Keyboard Navigation**: All interactive elements (Kanban cards, action buttons, zoom controls, Gantt bars) must be focusable via `Tab` and interactive via `Enter` or `Space`.
   - **Focus Visibility**: All interactive controls must display a high-contrast focus ring (`focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none`).
   - **Skip Link**: The top of the page must provide a `<a href="#main-content">Skip to main content</a>` element.
   - **Modal Dialogs**: Modals must declare `role="dialog" aria-modal="true" aria-labelledby="..."` and listen for `Escape` key events to dismiss.
3. **Understandable & Robust**:
   - **Form Controls**: Every `<input>`, `<select>`, `<textarea>` must have an explicit `id` matching its `<label htmlFor="...">`.
   - **Live Region**: A dynamic announcement region `<div role="status" aria-live="polite" className="sr-only">` must announce task state updates and schedule recalculations.

---

## 7. Execution Guide for Antigravity & Claude Code

When working on this repository, AI agents must adhere to the following rules:

1. **Webpack Build Constraint**:
   Because Node.js v26 IPC causes a known conflict with `@tailwindcss/turbopack`, **always execute Next.js with `--webpack`** (`npm run dev` and `npm run build` are preconfigured). Never remove `--webpack` from `package.json`.
2. **PostCSS Configuration**:
   Tailwind CSS v4 is compiled via `@tailwindcss/postcss` declared in `postcss.config.js`. Do not delete `postcss.config.js` or the `@source "../**/*.{js,ts,jsx,tsx}";` directive in `src/app/globals.css`.
3. **Deterministic Math Verification**:
   When altering scheduling logic in `src/lib/scheduler/`, always run `npx tsx scripts/test-scheduler.ts` to verify calendar wrapping, float calculations, and transition overhead math.
4. **MCP Verification**:
   Always verify MCP server modifications using `npx tsx scripts/test-mcp.ts`.
5. **Real-World Non-Technical Seed Integrity**:
   Keep seed data grounded in relatable real-world time-management activities (e.g., Thanksgiving Dinner, Bathroom Remodeling, School Plays) that illustrate setup and takedown mechanics intuitively.
