# Architecture

> How the system is built. *What* it must do lives in [`specs/`](../specs/README.md);
> project rules live in [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).
> If this document and a spec disagree, the spec wins and this file is the bug.

## Shape

```
 Browser (React)                 AI agent
   page.tsx, components/           MCP client
        | fetch JSON                  | stdio JSON-RPC
        v                             v
 src/app/api/**/route.ts        src/mcp/server.ts
   route(): guard + errors        tool(): errors
        \                           /
         v                         v
        src/lib/validation.ts  (zod: one set of rules)
        src/lib/services/*     (all database writes, transactional)
              |                         |
              v                         v
     Prisma -> SQLite            pure logic, no I/O:
     prisma/dev.db                 scheduler/  tasks/  ics.ts
                                   insights.ts baseline.ts decompose/
```

Two rules hold the design together (constitution, principles II and III):

1. **Pure core.** Everything that decides something (scheduling, state transitions,
   cycle checks, calendar parsing, insights, baseline comparison, model-reply parsing)
   is a pure function with tests in `tests/`. None of it imports Prisma or reads the clock.
2. **Thin doors.** Routes and MCP tools only parse input with the shared schemas and call
   a service. They never touch the database themselves.

## Directory map

| Path | Role |
|---|---|
| `src/lib/scheduler/engine.ts` | The scheduler: CPM, leveling, late dates, conflicts |
| `src/lib/scheduler/calendar.ts`, `tz.ts` | Working time: daily window minus busy blocks, in an IANA zone |
| `src/lib/scheduler/whatif.ts` | Compare the plan with a hypothetical change |
| `src/lib/tasks/transitions.ts` | Task state machine (pure planner) |
| `src/lib/tasks/graph.ts` | Cycle detection |
| `src/lib/ics.ts` | iCalendar reader |
| `src/lib/insights.ts`, `baseline.ts`, `backup-check.ts` | Reports and checks |
| `src/lib/decompose/` | Model client and reply parser; built-in templates |
| `src/lib/validation.ts` | Every input schema |
| `src/lib/guard.ts`, `api.ts`, `errors.ts` | Request guard, route wrapper, safe errors |
| `src/lib/services/` | `tasks`, `schedule`, `calendar`, `insights`, `baselines`, `backup`, `decompose` |
| `src/app/api/` | REST routes |
| `src/mcp/server.ts` | MCP tools |
| `src/components/`, `src/app/page.tsx` | UI |
| `tests/` | `node:test` suites; none needs a database |

## Time model

A task is `setup + work` (attended), then optional `unattended` waiting, then `takedown`
(attended):

```
|-- S --|------ D ------|~~~~~~ U (clock time, person is free) ~~~~~~|-- T --|
start                attendedEnd                              takedownStart  finish
```

- S, D, T are working minutes on the calendar. U is elapsed clock time, around the clock.
- With k logged interruptions the effective duration is `(k+1)·S + D + (k+1)·T (+ U)`.
- What remains to be planned depends on status: not started or paused needs `S + remaining D + T`;
  running needs `remaining D + T` from now; done needs nothing and sits at its actual dates.

## Scheduling passes

`calculateSchedule(tasks, dependencies, settings, now)`:

1. **Graph.** Dependencies between scheduled tasks; tasks on a cycle are flagged and their
   mutual links dropped.
2. **CPM.** Forward and backward pass without leveling, for slack. A second backward pass
   against a distant horizon isolates slack caused by real deadlines.
3. **ALAP.** As-late-as-possible tasks get their late start as a lower bound.
4. **Leveled forward pass.** Take the best ready task and place it at the earliest time
   that meets its bounds and does not overlap its assignee's occupied intervals. Order:
   done, running, hard pins, priority, deadline pressure, has-unattended-time, slack,
   board order.
5. **Backward pass** over dependencies plus implicit links between back-to-back work of
   the same assignee. Float is finish float; critical means float of 15 working minutes
   or less on an unfinished task.
6. **Conflicts.** Missed pins and deadlines, cycles, and two running tasks for one person.

Dependency bounds (lag in working minutes, negative is a lead):

| Type | Forward | Backward |
|---|---|---|
| FS | `ES(s) ≥ EF(p) + lag` | `LF(p) ≤ LS(s) − lag` |
| SS | `ES(s) ≥ ES(p) + lag` | `LS(p) ≤ LS(s) − lag` |
| FF | `EF(s) ≥ EF(p) + lag` | `LF(p) ≤ LF(s) − lag` |
| SF | `EF(s) ≥ ES(p) + lag` | `LS(p) ≤ LF(s) − lag` |

## Task states

```
BACKLOG <-> SCHEDULED --START--> IN_PROGRESS --PAUSE--> PAUSED
                                      ^                    |
                                      +------RESUME--------+
any but DONE --COMPLETE--> DONE --move--> BACKLOG | SCHEDULED (reopen)
```

START creates a SETUP session `[now, now+S]` and an open WORK session from `now+S`.
PAUSE closes the work session, adds a TAKEDOWN session and an interruption with `S+T`
overhead. Anything not in the diagram is refused with 409.

## Data

`prisma/schema.prisma`: `Task`, `TaskDependency`, `WorkSession`, `InterruptionLog`,
`ProjectSettings` (single row), `TimeOff`, `Baseline`, `BaselineEntry`. Changes ship as
migrations in `prisma/migrations/`.

## Request handling

`route()` in `src/lib/api.ts` wraps every handler: it marks the route as per-request,
runs `guardRequest` (Host allow-list, same-origin writes, JSON bodies only), and maps
errors: zod to 400 with field messages, `ApiError` to its status, Prisma not-found to 404,
everything else to a logged, generic 500.

## Build notes

- Always run Next with `--webpack`; the npm scripts do. Tailwind v4 compiles through
  `postcss.config.js`; keep the `@source` directive in `src/app/globals.css`.
- Read `node_modules/next/dist/docs/` before using Next APIs; this version differs from
  older ones.
- Seed data stays non-technical (a holiday dinner), so the time model is easy to see.

## Accessibility

Working standard is WCAG 2.1 AA (constitution, principle V): skip link, live region for
changes, labelled controls, visible focus, no meaning by color alone, dialogs that close
on Escape and return focus, and a text table equivalent of the timeline including
conflicts and baseline slip.
