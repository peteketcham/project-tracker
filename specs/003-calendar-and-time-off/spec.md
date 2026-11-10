# Feature Specification: Calendar, Settings and Time Off

**Feature Branch**: `003-calendar-and-time-off`

**Created**: 2026-11-09

**Status**: Implemented

**Input**: "I can only change working hours by editing the database, and the plan doesn't know about holidays or my appointments."

## User Scenarios & Testing

### User Story 1 - Set my working time (Priority: P1)

**Acceptance Scenarios**:

1. **Given** the settings dialog, **When** I save hours that end before they start, no working days, or an unknown time zone, **Then** the save is refused with a message on that field and nothing changes.
2. **Given** working hours of 09:00–17:00 in America/Chicago, **Then** tasks are planned in those local hours all year, across daylight-saving changes, wherever the server runs.
3. **Given** I switch off "one thing at a time", **Then** the plan is recomputed without leveling.

### User Story 2 - Block out time off (Priority: P1)

**Acceptance Scenarios**:

1. **Given** time off from 10:00 to 12:00 and a two-hour task starting at 09:00, **Then** the task finishes at 13:00; a full day off pushes work to the next working day.
2. **Given** time off that ends before it starts, **Then** it is refused.
3. **Given** I remove time off, **Then** the plan moves back.

### User Story 3 - Import my calendar (Priority: P2)

I give the tracker an .ics file or the address of an .ics feed, and its busy events for the
next six months block out working time.

**Acceptance Scenarios**:

1. **Given** events in UTC, with a named time zone, floating, or all-day, **Then** each becomes a busy block at the right instants.
2. **Given** events marked free (transparent) or cancelled, **Then** they are ignored.
3. **Given** daily, weekly (with weekdays), monthly or yearly repeats with interval, count, end date and exceptions, **Then** each occurrence inside the window becomes a busy block at the same wall-clock time.
4. **Given** a repeat rule the importer does not understand, **Then** that event is skipped and the result says how many were skipped.
5. **Given** I import again, **Then** previously imported blocks are replaced and hand-entered time off is kept.
6. **Given** something that is not an iCalendar file, an unreachable address, or a file over 2 MB, **Then** the import is refused and nothing changes.

### Edge Cases

- Busy blocks that cover an entire working window make that day non-working.
- The feed address is fetched once and never stored; a standing feed can be set as `ICS_URL` in the server environment.
- Fetched content is never returned to the browser, only the parsed events.

## Requirements

- **FR-001**: Users MUST be able to view and change working hours, working days, time zone, plan start and leveling.
- **FR-002**: Users MUST be able to add, list and remove time off.
- **FR-003**: The system MUST import iCalendar data from a file or an http(s)/webcal address, limited to 2 MB and a 10-second fetch.
- **FR-004**: The scheduler MUST treat time off and imported events as non-working time.
- **FR-005**: The settings dialog SHOULD meet WCAG 2.1 AA: labelled fields, grouped checkboxes, a status region for results, Escape to close.

## Success Criteria

- **SC-001**: Changing working hours takes effect on the timeline without a restart.
- **SC-002**: A typical personal calendar export (hundreds of events) imports in under two seconds.

## Assumptions

- One calendar for the whole tracker; per-assignee calendars are out of scope.
- Import is one-way and manual; live two-way sync is out of scope.
- Without authentication, anyone who can reach the server can make it fetch an address; the server is loopback-only until auth exists (constitution, Security).
