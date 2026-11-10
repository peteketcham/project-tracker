# Antigravity Project Tracker

A personal, time-aware project tracker. A board for doing the work, a timeline that shows
when it will really be finished, and an honest account of what interruptions cost.

- **Board**: Backlog, Scheduled, In Progress, Paused, Done, with drag and drop and Start / Pause / Resume / Done buttons.
- **Setup and takedown**: every task has focused work plus the time to get going and the time to stop cleanly. Pausing a task adds takedown now and setup again later, and everything downstream moves.
- **Realistic scheduling**: one person is never planned on two things at once. Unstarted work is never planned in the past; finished work stays where it happened.
- **Unattended time**: a task can include waiting that does not need you (the oven, tile curing, a long build). Other tasks fill it.
- **Dependencies and pins**: FS / SS / FF / SF with lag or lead; must-start-on, must-finish-on, no-earlier-than, no-later-than, as-late-as-possible. Anything that cannot be honored is shown as a conflict.
- **Calendar**: working hours, days and time zone in Settings; time off; import busy time from an `.ics` file or feed.
- **Insights**: interruption cost by reason and week, and estimated versus measured focused work.
- **Baselines**: save the plan's dates and see slip against them later.
- **Backup**: download everything as JSON; restore from a file.
- **MCP server**: AI agents can read and manage the plan under the same rules as the UI.
- **Decompose**: with a model configured, describe a project and get a linked task plan; without one, start from a built-in template.

## Getting started

```bash
npm install
cp .env.example .env          # defaults work as-is for local use
npx prisma migrate deploy     # creates prisma/dev.db from the migrations
npm run seed                  # optional: a demo holiday-dinner plan
npm run dev                   # http://localhost:3000
```

Already have a `prisma/dev.db` that was created with `prisma db push`? Either run
`npx prisma migrate reset` (drops the data and re-seeds), or keep the data with
`npx prisma migrate resolve --applied 20261110000000_init && npx prisma migrate deploy`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (always with webpack), bound to 127.0.0.1 |
| `npm test` | Unit tests (`node:test` via tsx); no database needed |
| `npm run typecheck`, `npm run lint` | TypeScript and ESLint |
| `npm run test:mcp` | Starts the MCP server and checks its tools (needs the database) |
| `npm run seed` | Replaces all data with the demo plan |
| `npm run mcp` | Runs the MCP server on stdio |

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file, relative to `prisma/schema.prisma` |
| `ALLOWED_HOSTS` | Extra hostnames allowed to reach the API besides localhost (see Security) |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Optional OpenAI-compatible chat endpoint for Decompose (Ollama, LM Studio, OpenAI, Gemini, Anthropic). Leave empty to use templates |
| `ICS_URL` | Optional calendar feed for "Refresh from configured calendar" |

## Security

There is **no sign-in yet**, so the app is built to be reachable only from your own machine:

- The server binds to `127.0.0.1`.
- Requests whose `Host` is not localhost or listed in `ALLOWED_HOSTS` are refused, as are cross-origin writes and non-JSON bodies.
- All input is validated; errors never include internal details.

Do not expose it on a network until authentication is added. To serve it on a LAN behind
something that authenticates, start Next with `-H 0.0.0.0` and set `ALLOWED_HOSTS`.

## MCP server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "project-tracker": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/project-tracker/src/mcp/server.ts"]
    }
  }
}
```

Tools: `list_tasks`, `create_task`, `update_task`, `delete_task`, `bulk_decompose_project`,
`add_dependency`, `remove_dependency`, `pin_task`, `track_work_session`,
`get_schedule_summary`, `what_if`, `list_time_off`, `add_time_off`, `get_insights`,
`save_baseline`, `compare_to_baseline`.

## How this project is developed

Spec-driven, with [Spec Kit](https://github.com/github/spec-kit):

- [`.specify/memory/constitution.md`](.specify/memory/constitution.md): the project's principles and gates.
- [`specs/`](specs/README.md): one folder per feature, with acceptance scenarios. Tests are named after them (`002/US2.1: …`).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how it is built.

## Tech stack

Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS v4 · SQLite via Prisma 6 ·
zod · `@modelcontextprotocol/sdk` · a pure TypeScript scheduler with no runtime dependencies.
