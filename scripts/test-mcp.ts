import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("Connecting to local Project Tracker MCP Server...");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Connected successfully to MCP Server!");

  const tools = await client.listTools();
  console.log(`Discovered ${tools.tools.length} MCP tools:`);
  for (const t of tools.tools) {
    console.log(` - ${t.name}: ${t.description}`);
  }

  const expected = [
    "list_tasks",
    "create_task",
    "bulk_decompose_project",
    "add_dependency",
    "pin_task",
    "get_schedule_summary",
    "track_work_session",
    "update_task",
    "delete_task",
    "remove_dependency",
    "what_if",
    "list_time_off",
    "add_time_off",
    "get_insights",
    "save_baseline",
    "compare_to_baseline",
  ];
  const names = new Set(tools.tools.map((t) => t.name));
  const missing = expected.filter((n) => !names.has(n));
  if (missing.length > 0) throw new Error(`Missing MCP tools: ${missing.join(", ")}`);

  // Bad input must come back as a tool error, not a crash or a write.
  const bad = await client.callTool({
    name: "create_task",
    arguments: { title: "x", baseDurationMinutes: -5 },
  });
  if (!bad.isError) throw new Error("create_task accepted negative minutes");
  console.log("Invalid input was refused as expected.");

  // Call get_schedule_summary
  console.log("\nCalling 'get_schedule_summary'...");
  const summaryResult = await client.callTool({
    name: "get_schedule_summary",
    arguments: {},
  });
  const content = summaryResult.content as Array<{ text?: string }>;
  if (summaryResult.isError) throw new Error(`get_schedule_summary failed: ${content[0]?.text}`);
  console.log("Summary result:", content[0]?.text?.slice(0, 300) + "...");

  await client.close();
  console.log("\nMCP Server test completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP test failed:", err);
  process.exit(1);
});
