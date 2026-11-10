# Feature Specification: Baselines and Backup

**Feature Branch**: `006-baselines-and-backup`

**Created**: 2026-11-09

**Status**: Implemented

**Input**: "The plan re-computes all the time, so I can't tell how far it has drifted from what I originally intended. And all my data is one file with no way to copy or restore it from the app."

## User Scenarios & Testing

### User Story 1 - Measure slip against a saved plan (Priority: P1)

**Acceptance Scenarios**:

1. **Given** the current plan, **When** I save a baseline with a name, **Then** every scheduled task's start and finish and the plan's finish date are stored.
2. **Given** a saved baseline, **When** I choose it on the timeline, **Then** each task shows where it was planned and how many working minutes its finish has moved, and the toolbar shows the finish-date slip and how many tasks are late.
3. **Given** tasks added or deleted since the baseline, **Then** they are reported as added or removed rather than as slip.
4. **Given** I delete a baseline, **Then** only that baseline is removed.

### User Story 2 - Back up and restore (Priority: P2)

**Acceptance Scenarios**:

1. **Given** any state, **When** I download a backup, **Then** I get one JSON file with settings, tasks, dependencies, sessions, interruptions, time off and baselines.
2. **Given** a backup file, **When** I restore it and confirm, **Then** the tracker's contents are replaced by the file's, all or nothing.
3. **Given** a file that is not a valid backup (wrong version, unknown status, a link to a missing task, duplicate ids, a dependency cycle), **Then** the restore is refused and nothing is deleted.
4. **Given** a restore request without the explicit confirmation, **Then** it is refused.

### Edge Cases

- Backups made before a field existed restore with that field's default.
- Baseline entries outlive deleted tasks.

## Requirements

- **FR-001**: Users and agents MUST be able to save, list, compare and delete baselines.
- **FR-002**: Slip MUST be measured in working time on the current calendar.
- **FR-003**: Export MUST include every table; import MUST validate the whole file before deleting anything and MUST run in one transaction.
- **FR-004**: The baseline comparison MUST be available without relying on the picture (text table column and toolbar text).

## Success Criteria

- **SC-001**: Export followed by import into an empty tracker reproduces the same schedule.

## Assumptions

- Restore replaces everything; merging two trackers is out of scope.
- Until authentication exists, export is reachable by anyone who can reach the server; the server is loopback-only (constitution, Security).
