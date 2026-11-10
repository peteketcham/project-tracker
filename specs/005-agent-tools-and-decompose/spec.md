# Feature Specification: Agent Tools and Decomposition

**Feature Branch**: `005-agent-tools-and-decompose`

**Created**: 2026-11-09

**Status**: Implemented

**Input**: "Agents can create things but not fix or remove them, and can't ask 'what happens if'. And the Decompose button says AI but it's four canned lists."

## User Scenarios & Testing

### User Story 1 - An agent can maintain the plan, not only add to it (Priority: P1)

**Acceptance Scenarios**:

1. **Given** an existing task, **When** an agent updates its fields or status, **Then** the same validation and state rules apply as in the UI.
2. **Given** a task or dependency, **When** an agent deletes it, **Then** it is gone and the schedule recomputes.
3. **Given** invalid tool input, **Then** the tool returns an error message and nothing is saved.
4. **Given** an agent adds time off or asks for insights, **Then** it gets the same result the UI would.

### User Story 2 - Ask "what if" before deciding (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a running task, **When** I ask what happens if it is interrupted now, **Then** I see how far the finish date and each affected task slip, and nothing is changed.
2. **Given** any scheduled task, **When** I try extending it, dropping it, or blocking out time off, **Then** I get the same kind of answer.
3. **Given** a change that would break a pin or deadline, **Then** the answer lists the new conflict.
4. **Given** a task that is not running, **When** I ask to interrupt it, **Then** the request is refused.

### User Story 3 - Decompose with a real model, labelled honestly (Priority: P2)

**Acceptance Scenarios**:

1. **Given** no model is configured, **Then** the button reads "Templates", the dialog says the plans are built in, and tasks come from a starter template.
2. **Given** a model is configured, **When** I describe a project, **Then** the model's proposal becomes tasks with setup, takedown and unattended time and real (not merely sequential) dependencies.
3. **Given** a model reply, **Then** only task and dependency fields are taken from it, and the plan must pass the same validation as any other plan; a model cannot set status, ids or pins.
4. **Given** an unusable reply, an unreachable endpoint, or an error status, **Then** nothing is saved and I see a plain message without endpoint or account details.

### Edge Cases

- Model replies wrapped in code fences or prose are accepted if they contain one JSON object.
- At most 30 tasks are taken from a reply.

## Requirements

- **FR-001**: MCP MUST offer update, delete, remove-dependency, what-if, time-off and insights tools backed by the shared services.
- **FR-002**: What-if MUST be a pure computation over the current inputs.
- **FR-003**: The model integration MUST work with any OpenAI-compatible chat-completions endpoint, configured by `LLM_BASE_URL`, `LLM_MODEL` and optional `LLM_API_KEY`; the key MUST stay on the server.
- **FR-004**: The UI MUST NOT describe template output as AI.

## Success Criteria

- **SC-001**: An agent can take a plan from empty to scheduled, then repair it (rename, re-estimate, unlink, delete), using MCP only.
- **SC-002**: With a local model running, a described project becomes a scheduled plan in one step.

## Assumptions

- The description you type is sent to whatever endpoint you configure; choosing a local or hosted model is your decision.
- What-if is exposed to agents first; a UI for it can follow.
