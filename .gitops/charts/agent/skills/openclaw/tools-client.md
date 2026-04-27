# Tools Client Skill

How the CTO tool server and MCP tool architecture works in this environment.

## Architecture

```
OpenClaw Gateway
  ├── Built-in tools (exec, web_search, web_fetch, browser, etc.)
  ├── Remote tools (CTO tool server via remoteTools globs)
  ├── Code-execution SDK (/workspace/.cto-tools/mcp.mjs)
  └── Local MCP servers (spawned alongside CLI sessions)

CLI Backends (Claude Code, Codex, Droid)
  ├── Their own built-in tools
  ├── MCP servers (Claude Code: .claude.json, others: tools-config.json)
  └── Remote tools from tools-config.json
```

## tools-config.json

Located at `/workspace/tools-config.json`. Provides MCP tools to CLI backends.

```json
{
  "remoteTools": ["exa_*", "web_*_exa", "firecrawl_*", "tavily_*"],
  "localServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "tools": ["create_entities", "search_nodes", ...]
    }
  }
}
```

### remoteTools

Glob patterns matching tools forwarded from the CTO tool server. The tool server runs as a sidecar/service and exposes tools via MCP protocol. Patterns like `"firecrawl_*"` match all Firecrawl tools. Use the central `cto-tools` service for research providers such as Exa, Firecrawl, and Tavily instead of duplicating those servers as per-agent local MCP entries.

Exa's MCP package exposes `web_search_exa` and `web_fetch_exa`, so keep the `web_*_exa` glob alongside any `exa_*` compatibility glob.

## Code-execution SDK

Use `/workspace/.cto-tools/mcp.mjs` when a code execution task needs MCP tools directly:

```js
import { callTool, describeTool, listTools, escalate } from "/workspace/.cto-tools/mcp.mjs";

const catalog = await listTools();
const result = await callTool("firecrawl_search", { query: "5D Labs CTO" });
```

The SDK uses `TOOLS_SERVER_URL`/`TOOL_SERVER_URL` and `/workspace/tools-config.json`, then routes calls through the central `cto-tools` service. It enforces `remoteTools` before calling remote tools and always allows `tools_*` escalation/catalog helpers.

### localServers

MCP servers spawned locally alongside CLI sessions. Each entry defines:
- `command` + `args`: How to start the server
- `tools`: Whitelist of tool names to expose (empty = all)

## Adding New Tools

1. **Remote tool from CTO server:** Add a glob pattern to `remoteTools` in values.yaml under `toolsConfig`
2. **New local MCP server:** Add an entry to `localServers` with the npx command and tool whitelist
3. **Claude Code MCP server:** Add to `claudeCode.mcp.servers` in values.yaml (renders into `.claude.json`)

## Available Tool Groups

The OpenClaw gateway organizes tools into groups:
- `group:runtime` — exec, shell, process management
- `group:fs` — file read/write/search
- `group:sessions` — session management (in-process only)
- `group:memory` — memory read/write/search
- `group:web` — web_search, web_fetch, browser
- `group:ui` — Control UI interactions

The `tools.profile: "full"` setting enables all groups with no restrictions.

## Plugin Tools

Plugin-registered tools are separate from tool groups and must be explicitly added to `tools.allow`:

- `nats` — Cross-pod inter-agent messaging via NATS. Supports publish, request, and discover actions. This is the primary mechanism for agent-to-agent communication since each agent runs in its own pod.
