# Implementation Plan: Realistic Scheduling

**Spec**: [spec.md](spec.md)

## Approach

`src/lib/scheduler/engine.ts`, pure, four passes:

1. **CPM forward/backward** with no leveling, to get each task's slack. A second backward
   pass against a far horizon isolates slack that comes from real deadlines.
2. **ALAP** tasks get their late start as a lower bound.
3. **Serial schedule generation**: repeatedly take the best ready task (status, hard pin,
   priority, deadline slack, has-wait, slack, board order) and place it at the earliest time
   that satisfies its bounds and does not overlap the assignee's occupied intervals. A task
   occupies `[start, attendedEnd]` and `[takedownStart, finish]`.
4. **Backward pass** over dependencies plus implicit links between back-to-back work of
   the same assignee, giving late dates, float (finish float) and the critical set.

`src/lib/scheduler/calendar.ts` is a `WorkCalendar` class built on per-day free intervals
(working window minus busy blocks) in a configured IANA time zone (`tz.ts`, Intl only).

## Data

- `Task.unattendedMinutes Int @default(0)`, `Task.assignee String?`
- `ProjectSettings.levelResources Boolean @default(true)`, `ProjectSettings.timezone String?`
- Work sessions now start when setup ends, so logged focused time excludes setup.

## Constitution check

- II (pure, test-first): `now` is a parameter; every scenario above has a test in
  `tests/scheduler.test.ts` named `002/USx.y`.
- IV (realistic time): this feature is that principle.
- VI (simple): no new dependencies; leveling is a greedy heuristic, not an optimizer.
  Rejected: preemptive splitting of tasks (hard to explain, rarely what a person does).
