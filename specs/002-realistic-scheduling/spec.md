# Feature Specification: Realistic Scheduling

**Feature Branch**: `002-realistic-scheduling`

**Created**: 2026-11-09

**Status**: Implemented

**Input**: "The plan pretends I can do two things at once and that I can start yesterday. Schedule around one person's attention, keep finished work where it happened, and let me say when part of a task doesn't need me (the oven, the tile curing)."

## User Scenarios & Testing

### User Story 1 - One person, one thing at a time (Priority: P1)

Tasks that need my attention are never planned on top of each other. When several are
ready, the tracker decides which goes first in a way I can predict.

**Why this priority**: A plan that double-books me gives a finish date that cannot happen.

**Independent Test**: Create two unlinked one-hour tasks and confirm they are scheduled back to back, not side by side.

**Acceptance Scenarios**:

1. **Given** two ready tasks for the same person, **When** the schedule is computed, **Then** they do not overlap and the higher-priority one is first.
2. **Given** equal priority, **Then** the order is: tasks squeezed by a deadline, then tasks with unattended time, then least slack, then board order.
3. **Given** tasks assigned to different people, **Then** they may run at the same time.
4. **Given** back-to-back tasks for one person, **Then** all of them are critical, because any slip pushes the next; a task followed by idle time is not critical and shows that idle time as float.

### User Story 2 - Hands-on time versus waiting (Priority: P1)

A task can have unattended time between its work and its takedown: the turkey roasts, the
tile cures. That time passes around the clock and I am free to do other tasks in it.

**Acceptance Scenarios**:

1. **Given** a task with 30 min work, 180 min unattended and 30 min takedown starting 09:00, and a second one-hour task, **Then** the second task runs 09:30–10:30 inside the wait and the first finishes at 13:00.
2. **Given** 24 hours of unattended time that starts at the end of a working day, **Then** it ends at the same clock time the next day regardless of working hours, and a takedown then waits for the next working time.
3. **Given** a task too long to fit inside another task's wait, **Then** it is scheduled after that task's takedown rather than delaying the takedown.
4. **Given** the person is already committed (pinned or running work) when a wait ends, **Then** the takedown moves to their next free time.

### User Story 3 - Anchored to now (Priority: P1)

**Acceptance Scenarios**:

1. **Given** the current time, **Then** no unstarted or paused work is planned before it; outside working hours it starts at the next working time.
2. **Given** a finished task, **Then** it stays at its actual start and finish forever and its successors are planned from now, not from its dates.
3. **Given** a running task, **Then** it keeps its actual start, only its remaining work and takedown are planned from now, and other work for that person, whatever its priority, waits for it.
4. **Given** two tasks running at once for one person, **Then** a conflict says so.

### User Story 4 - Pins and deadlines in a leveled plan (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a task that must start on a date, **Then** it keeps that slot and other work flows around it.
2. **Given** a task that must finish on a date, **Then** it is scheduled to end then.
3. **Given** a pin or deadline that cannot be met, **Then** the conflict names the task and the miss in working minutes (see 001, story 5).

### Edge Cases

- A task with no attended time left (all done but the wait) occupies nobody.
- Leveling can be switched off in settings; the plan is then pure critical-path with unlimited parallelism.
- As-late-as-possible is computed before leveling; in a leveled plan the task may land later than that.

## Requirements

### Functional Requirements

- **FR-001**: Tasks MUST support unattended minutes (default 0) and an optional assignee (default: the owner).
- **FR-002**: With leveling on, attended stretches (setup+work, and takedown) of one assignee MUST NOT overlap.
- **FR-003**: Unattended time MUST be measured in elapsed clock time.
- **FR-004**: The schedule MUST be a function of the stored data and the current time only; the scheduler itself MUST NOT read the clock.
- **FR-005**: Finished tasks MUST be reported at their actual dates; running tasks MUST be planned from now with remaining work only.
- **FR-006**: The ordering rule in story 1 MUST be deterministic.
- **FR-007**: Float and criticality MUST account for back-to-back work of the same assignee.

## Success Criteria

- **SC-001**: In any generated plan, no two attended stretches for one assignee overlap (property test).
- **SC-002**: Opening the app on a later day never moves a finished task.
- **SC-003**: The demo holiday-dinner plan finishes earlier with the roast modeled as unattended time than with it modeled as attended time.

## Assumptions

- Tasks are not split by the planner; a task that does not fit in a gap moves after it.
- A takedown should happen when the wait ends (food burns), so it reserves its slot at planning time.
- Team support is limited to an assignee label; per-person calendars are out of scope.
