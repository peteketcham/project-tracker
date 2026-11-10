# Project Tracker Constitution

## Core Principles

### I. Spec Before Code
Every behavior change starts as a change to a spec under `specs/NNN-feature/spec.md`,
written as user stories with Given/When/Then acceptance scenarios. Specs say *what* and
*why*; technology choices live in `plan.md`. A spec that the code no longer satisfies is a
bug in one of them and must be reconciled in the same change. `docs/ARCHITECTURE.md`
describes how the system is built; it never overrides a spec.

### II. Deterministic Scheduler, Test-First (NON-NEGOTIABLE)
Everything under `src/lib/scheduler/` is pure: no database, no network, no reading the
clock. "Now" and the calendar are inputs. Any change to scheduling math starts with a
failing test in `tests/` that encodes the acceptance scenario, then the implementation.
All other code needs tests for its rules (validation, state transitions, parsers) but
strict red-green order is not required. A test that cannot fail is not a test.

### III. One Set of Rules for Every Door
The web UI, the REST API and the MCP server are three doors into the same system. Input
validation (`src/lib/validation.ts`) and business operations (`src/lib/services/`) are
shared; no door re-implements them. Task status changes only through the state machine.
Multi-row writes are transactional.

### IV. Realistic Time
A person's attention is a finite resource. The schedule never places two attended
activities for the same person at the same time, never plans unstarted work in the past,
and keeps finished work where it actually happened. When constraints cannot all be met
the scheduler says so as an explicit conflict; it never silently drops a constraint.

### V. Accessible by Default
WCAG 2.1 AA is the working standard for all UI: keyboard operable, visible focus, labelled
controls, no meaning by color alone, a text alternative for the timeline. Exceptions are
allowed only when written down in the feature spec with the reason.

### VI. Honest and Simple
Features are named for what they do. Local-first: one SQLite file, no services required
to run. Add a dependency, a table or an abstraction only when a spec needs it.

## Security & Deployment

- Target today is one user on localhost; target later is a home network once
  authentication exists. Until then the server binds to loopback and rejects requests
  whose Host or Origin is not on the allow-list.
- All external input is validated at the boundary. Error responses never include internal
  messages.
- Secrets (model API keys, calendar URLs) live in `.env`, are used server-side only, and
  are never committed. `.env.example` documents every variable.
- The data model keeps an `assignee` on tasks so a small team can be supported later
  without a rewrite; multi-user access control is out of scope until a spec adds it.

## Technology Constraints

- Next.js 16 App Router, built with `--webpack` (Turbopack conflicts with the Tailwind
  plugin on current Node). Read `node_modules/next/dist/docs/` before using Next APIs.
- Tailwind CSS v4 through `postcss.config.js`; keep the `@source` directive in
  `src/app/globals.css`.
- Prisma 6 on SQLite. Schema changes ship as migrations in `prisma/migrations/`.
- Seed data stays grounded in everyday, non-technical projects (a holiday dinner, a
  bathroom remodel, a school play).

## Development Workflow

1. `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
2. Gates before a change is done: `npm run lint`, `npm run typecheck`, `npm test`,
   `npm run build`. CI runs the same four.
3. Small commits with conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
4. MCP changes are also checked with `npm run test:mcp`.

## Governance

This constitution supersedes other project guidance. Amend it by editing this file in its
own commit with the reason in the message; bump the version (major for removing or
redefining a principle, minor for adding one, patch for wording). Reviews check changes
against these principles; a justified exception is recorded in the feature's `plan.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09
