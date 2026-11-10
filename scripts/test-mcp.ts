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

  // Call get_schedule_summary
  console.log("\nCalling 'get_schedule_summary'...");
  const summaryResult = await client.callTool({
    name: "get_schedule_summary",
    arguments: {},
  });
  const content = summaryResult.content as Array<{ text?: string }>;
  console.log("Summary result:", content[0]?.text?.slice(0, 300) + "...");

  await client.close();
  console.log("\nMCP Server test completed successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP test failed:", err);
  process.exit(1);
});
