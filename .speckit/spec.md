# Antigravity Tracker Speckit Spec
See root [/SPEC.md](../SPEC.md) for full system specification.

## Quick Agent Summary
- **App**: Next.js 16 (App Router) + SQLite (Prisma 6) + Tailwind v4 (`postcss.config.js` + Webpack)
- **Features**: Jira-style Kanban, Reactive Gantt, Context-Switching (Setup/Takedown) Model, Critical Path Method (CPM), WCAG 2.1 AA accessible.
- **MCP Server**: `src/mcp/server.ts` (`npm run mcp`)
- **Key Files**:
  - `src/lib/scheduler/engine.ts`: CPM algorithm (Forward/Backward passes, Float, Critical Path)
  - `src/lib/scheduler/calendar.ts`: Working window wrapping and calendar minutes
  - `src/lib/scheduler/interruption.ts`: Setup warm-up and takedown wrap-up injection
  - `src/components/GanttChart.tsx`: Segmented SVG Gantt timeline with screen-reader table
  - `src/components/KanbanBoard.tsx`: Accessible agile columns with keyboard & drag-and-drop
  - `src/mcp/server.ts`: Built-in Model Context Protocol server exposing 7 tools
