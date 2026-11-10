# Feature Specification: Insights

**Feature Branch**: `004-insights`

**Created**: 2026-11-09

**Status**: Implemented

**Input**: "The tracker records every work session and every interruption with a reason. Show me what that data says: what switching costs me and whether my estimates are any good."

## User Scenarios & Testing

### User Story 1 - What interruptions cost (Priority: P1)

**Acceptance Scenarios**:

1. **Given** logged interruptions, **Then** I see how many there were and their total overhead, for the last 7 days and all time.
2. **Given** reasons typed with different spacing or capitals, **Then** they are grouped together; interruptions with no reason are grouped as "No reason given".
3. **Given** the last eight weeks, **Then** I see interruptions and overhead per week, as a table (not only a picture).
4. **Given** interruptions that were resumed, **Then** I see the average time it took to get back.

### User Story 2 - Whether my estimates hold (Priority: P2)

**Acceptance Scenarios**:

1. **Given** finished tasks with measured focused work, **Then** I see estimated versus actual per task and overall.
2. **Given** at least three such tasks and actual work 15% or more above or below estimates, **Then** I get a one-line suggestion with the correction factor; with fewer than three, no suggestion.
3. **Given** unfinished tasks or finished tasks with no measurements, **Then** they are left out of the comparison.

### Edge Cases

- No data at all: every figure shows "No data" and the dialog explains how to start collecting.

## Requirements

- **FR-001**: The report MUST be computed only from measured data. Setup and takedown sessions are recorded at planned length and MUST NOT be presented as measurements.
- **FR-002**: The same report MUST be available to agents over MCP.
- **FR-003**: The report dialog SHOULD meet WCAG 2.1 AA; every chart-like element has a table equivalent.

## Success Criteria

- **SC-001**: After a week of use, I can name my most expensive interruption reason from this screen.

## Assumptions

- Weeks start on Monday (UTC).
- Measuring real setup and takedown time needs explicit start/stop for those phases; that is a later feature.
