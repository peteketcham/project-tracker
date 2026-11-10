# Feature Specification: Core Tracker (baseline)

**Feature Branch**: `001-core-tracker`

**Created**: 2026-11-09

**Status**: Implemented (written retroactively from the first working version, then corrected)

**Input**: "A personal, time-aware project tracker: a board for doing the work, a timeline that shows when it will really be finished, and an honest account of what interruptions cost. AI agents can read and edit the plan."

## User Scenarios & Testing

### User Story 1 - Plan work as tasks with honest durations (Priority: P1)

I describe a piece of work as a task with focused work time plus the setup time I need to
get going and the takedown time I need to stop cleanly. I link tasks that depend on each
other and see when each will happen and when the whole plan finishes.

**Why this priority**: Without tasks, dependencies and a computed timeline there is no product.

**Independent Test**: Create three linked tasks and confirm the timeline shows each task's start and finish inside working hours, in dependency order, with a finish date for the plan.

**Acceptance Scenarios**:

1. **Given** working hours of 09:00–17:00 on weekdays and a task of 15 min setup, 120 min work, 15 min takedown starting Monday 09:00, **When** the schedule is computed, **Then** the task finishes Monday 11:30.
2. **Given** task B depends on task A finish-to-start, **When** A's duration grows, **Then** B's start moves later by the same working time.
3. **Given** a task that cannot finish before the working day ends, **When** the schedule is computed, **Then** the remainder continues at the start of the next working day and weekends are skipped.
4. **Given** each dependency type (finish-to-start, start-to-start, finish-to-finish, start-to-finish) with a lag, **When** the schedule is computed, **Then** the successor satisfies that relation.
5. **Given** a new dependency that would make a task depend on itself through a chain, **When** I try to add it, **Then** it is refused with an explanation and nothing changes.

### User Story 2 - Do the work on a board (Priority: P1)

I move tasks through Backlog, Scheduled, In Progress, Paused and Done by dragging or with
buttons, and the tracker records when I actually worked.

**Independent Test**: Start, pause, resume and complete one task and confirm the recorded sessions and the status at each step.

**Acceptance Scenarios**:

1. **Given** a scheduled task, **When** I start it, **Then** it is In Progress with a setup session followed by an open work session.
2. **Given** a task already In Progress, **When** a second start arrives, **Then** it is refused and no extra sessions are created.
3. **Given** an In Progress task, **When** I try to move it straight to Backlog, **Then** I am told to pause or complete it first.
4. **Given** a Done task, **When** I reopen it, **Then** it returns to Scheduled and its completion time is cleared.

### User Story 3 - See what interruptions cost (Priority: P1)

When I am interrupted I pause the task and say why. The tracker adds the takedown I need
now and the setup I will need to get back in, and everything downstream moves.

**Acceptance Scenarios**:

1. **Given** an In Progress task with 15 min setup and 10 min takedown, **When** I pause it, **Then** an interruption is logged with 25 min of overhead and the task is Paused.
2. **Given** a task with setup S, takedown T and focused work D that has been interrupted k times, **When** I look at its effective duration, **Then** it is (k+1)·S + D + (k+1)·T.
3. **Given** a paused task with remaining work R, **When** the schedule is computed, **Then** its remaining plan is S + R + T and its successors start after that.

### User Story 4 - Know what is critical (Priority: P2)

Tasks that cannot slip without delaying the plan are marked critical on the board and the
timeline, by more than color alone.

**Acceptance Scenarios**:

1. **Given** a chain of tasks that determines the finish date and a side task with spare time, **When** the schedule is computed, **Then** the chain is critical and the side task is not, with its spare time shown.
2. **Given** a finished task, **Then** it is never marked critical.

### User Story 5 - Pin tasks to dates (Priority: P2)

I can say a task must start on, must finish on, start no earlier than, or finish no later
than a date, or should happen as late as possible.

**Acceptance Scenarios**:

1. **Given** "start no earlier than Wednesday 09:00", **Then** the task does not start before then.
2. **Given** "as late as possible" on a task with spare time, **Then** it is placed at its latest start that does not delay the plan.
3. **Given** a pinned date that the task's prerequisites make impossible, **Then** the task is scheduled as early as it realistically can be and a conflict names the task and the size of the miss.

### User Story 6 - Let an AI agent manage the plan (Priority: P2)

An agent connected over MCP can list, create, update, delete, link, pin and track tasks
and read the schedule, under exactly the same rules as the UI.

**Acceptance Scenarios**:

1. **Given** an agent submits a batch of tasks and dependencies where one item is invalid, **Then** nothing from the batch is saved.
2. **Given** an agent starts a task, **Then** the same sessions exist as when I press Start.

### Edge Cases

- No tasks: the timeline is empty and the finish date equals the start.
- Working hours that end before they start, or no working days: refused when saved; the scheduler falls back to 09:00–17:00 weekdays if it ever meets them.
- A dependency cycle that already exists in the data: the tasks in it are flagged and scheduled without the cyclic links so the rest of the plan still renders.
- Bad input (unknown status, negative minutes, unparseable date): refused with a message naming the field; nothing is saved.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST store tasks with title, description, status, priority, focused-work, setup and takedown minutes, constraint and pinned date.
- **FR-002**: The system MUST support the four dependency types with lag and refuse self-links and cycles.
- **FR-003**: The system MUST compute start, finish, latest start, latest finish and float for every non-backlog task within the working calendar.
- **FR-004**: The system MUST mark as critical every unfinished task whose float is 15 working minutes or less.
- **FR-005**: The system MUST change task status only through defined transitions and record setup, work and takedown sessions for them.
- **FR-006**: The system MUST log each interruption with its reason and overhead.
- **FR-007**: The system MUST report every constraint it could not honor as a conflict.
- **FR-008**: The system MUST apply the same validation and rules to UI, REST and MCP requests.
- **FR-009**: Multi-item writes MUST be all-or-nothing.
- **FR-010**: The system MUST reject malformed input and cross-site or foreign-host requests, and MUST NOT reveal internal error details.
- **FR-011**: The UI SHOULD meet WCAG 2.1 AA, including a text table equivalent of the timeline, keyboard operation and a live region for changes.

### Key Entities

- **Task**: a unit of work with attended time, buffers, status, priority and optional pin.
- **Dependency**: an ordering relation between two tasks with type and lag.
- **Work session**: a recorded interval of setup, work or takedown on a task.
- **Interruption**: a pause event with reason and overhead.
- **Settings**: working hours, working days and scheduling options.

## Success Criteria

- **SC-001**: Every acceptance scenario above is covered by an automated test that fails if the behavior regresses.
- **SC-002**: A plan of 200 tasks recomputes in under one second.
- **SC-003**: A fresh clone can be running with seed data in under five minutes by following the README.
- **SC-004**: No request with invalid input ever changes stored data.

## Assumptions

- One person uses the tracker on their own machine; there is no sign-in yet.
- Times are shown in the configured time zone.
- Lag is measured in working time.
