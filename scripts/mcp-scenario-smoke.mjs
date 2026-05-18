#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const toolName = process.argv[2] ?? "scenario_recommend_morgan_avatar_models";
const args = process.argv[3] ? JSON.parse(process.argv[3]) : { includeSearch: true };

const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp:scenario", "--silent"],
  cwd: process.cwd(),
  stderr: "pipe",
});
transport.stderr?.on("data", (chunk) => process.stderr.write(chunk));
const client = new Client({ name: "cto-scenario-smoke", version: "0.1.0" });
await client.connect(transport);
const tools = await client.listTools();
console.error(`tools: ${tools.tools.map((tool) => tool.name).join(", ")}`);
const result = await client.callTool({ name: toolName, arguments: args });
console.log(JSON.stringify(result, null, 2));
await client.close();
