# Antigravity Project Tracker

A time-aware project management web application combining agile board workflows (Jira-style) with a deterministic, constraint-based **Critical Path Method (CPM)** reactive scheduler and **realistic setup & takedown context-switching penalty modeling**.

Includes a built-in **Model Context Protocol (MCP)** server so AI agents (like Antigravity, Claude, or Cursor) can decompose requirements, link dependencies, pin dates, and manage the board programmatically.

---

## Key Features

1. **Agile Kanban Board**:
   - Status columns: `Backlog`, `Scheduled`, `In Progress`, `Paused / Interrupted`, and `Done`.
   - Native HTML5 Drag-and-Drop between columns.
   - Real-time action buttons: *Start*, *Interrupt / Pause* (with reason tracking), *Resume*, and *Done*.

2. **Setup & Takedown Context-Switching Modeling**:
   - Pure focused work is separated from mental ramp-up and wrap-up times.
   - **Takedown Penalty**: Pausing a task injects wrap-up time (saving work, committing state, logging status).
   - **Setup Warm-up**: Resuming or starting a task injects warm-up time (loading IDE, restoring mental context).
   - Downstream dependent tasks automatically slip forward to preserve realistic schedule integrity.

3. **Reactive Gantt & Timeline Engine**:
   - High-performance horizontal timeline with **Hour**, **Day**, and **Week** zoom levels.
   - Multi-segment task bars:
     - Left striped cap: **Setup buffer**
     - Solid colored body: **Core focused work**
     - Right striped cap: **Takedown buffer**
   - **Critical Path Highlighting**: Bottleneck tasks with float $\le 15$m are highlighted in glowing red with a critical flame indicator.
   - **Curved Bezier Dependency Links**: Visual connections (`FS`, `SS`, `FF`, `SF`) that highlight in red when on the critical path.
   - **Pinned Date Constraints**: Support for `MUST_START_ON`, `MUST_FINISH_ON`, `START_NO_EARLIER_THAN`, and `FINISH_NO_LATER_THAN`.

4. **In-App AI Auto-Decompose**:
   - Click the **✨ AI Decompose** button to type any high-level objective (e.g. *"Build Stripe subscription checkout and webhook sync"*).
   - Automatically decomposes the feature into sequenced tasks, assigns realistic setup/takedown times, and calculates the timeline.

5. **Built-in Model Context Protocol (MCP) Server**:
   - Run `npm run mcp` to connect your AI assistant directly to the project database via stdio.

---

## Getting Started

### 1. Install & Seed
```bash
# Dependencies are already installed
npm run seed     # Seeds realistic initial sprint data with dependencies & interruptions
```

### 2. Run the Web Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Model Context Protocol (MCP) Setup

To allow AI coding assistants (like Antigravity, Claude Desktop, or Cursor) to read and populate your project tracker, add the following to your MCP client configuration:

### Configuration JSON:
```json
{
  "mcpServers": {
    "project-tracker": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/peteketcham/git/project-tracker/src/mcp/server.ts"
      ]
    }
  }
}
```

### Available MCP Tools:
- `list_tasks`: Inspect all tasks, constraints, priorities, and statuses.
- `create_task`: Create a task with duration, setup/takedown buffers, and constraints.
- `bulk_decompose_project`: Create 5–20 interconnected tasks and dependencies in an atomic batch.
- `add_dependency`: Link two tasks with `FS`, `SS`, `FF`, or `SF` and lag minutes.
- `pin_task`: Apply date constraints like `MUST_START_ON` or `MUST_FINISH_ON`.
- `get_schedule_summary`: Query project completion date, critical path bottlenecks, and float.
- `track_work_session`: Start, pause (with takedown overhead), resume (with setup warm-up), or complete tasks.

---

## Tech Stack
- **Framework**: Next.js 16 (App Router, React 19, TypeScript)
- **Styling**: Tailwind CSS, Lucide Icons
- **Database & ORM**: SQLite (`dev.db`) via Prisma 6 ORM
- **Scheduling**: Graph DAG Critical Path Method (CPM) solver in pure TypeScript
- **AI Protocol**: `@modelcontextprotocol/sdk` (stdio transport)
