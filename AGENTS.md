<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

- Principles and gates: `.specify/memory/constitution.md`. Specs: `specs/`. Architecture: `docs/ARCHITECTURE.md`.
- Always run Next.js with `--webpack` (the npm scripts do). Do not remove it.
- Scheduler code (`src/lib/scheduler/`) is pure and test-first: write the failing test in `tests/` before changing it.
- REST routes and MCP tools must go through `src/lib/validation.ts` and `src/lib/services/`; do not write to the database from a route or tool directly.
- Before finishing: `npm run lint && npm run typecheck && npm test && npm run build`.
