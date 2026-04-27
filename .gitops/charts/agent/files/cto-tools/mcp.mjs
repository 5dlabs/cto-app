// MCP tool-calling runtime for CTO Desktop agents.
// Provides a small SDK surface for code-execution flows so agents can call
// central cto-tools MCP tools from JavaScript instead of relying only on CLI MCP.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export class ToolError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.data = data;
  }
}

export const ErrorCodes = {
  TOOL_NOT_FOUND: -32601,
  POLICY_DENIED: -32403,
  SERVER_ERROR: -32000,
};

const DEFAULT_TOOLS_SERVER_URL =
  "http://cto-tools.cto-system.svc.cluster.local:3000/mcp";
const DEFAULT_CLIENT_CONFIG_PATH = "/workspace/tools-config.json";
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
let rpcId = 0;

function env(key, fallback = "") {
  return process.env[key] ?? fallback;
}

function normalizeMcpUrl(value) {
  const base = String(value || DEFAULT_TOOLS_SERVER_URL).replace(/\/+$/, "");
  if (base.endsWith("/mcp")) return base;
  if (base.endsWith("/sse")) return `${base.slice(0, -4)}/mcp`;
  return `${base}/mcp`;
}

function loadClientConfig() {
  const configPath = env("CLIENT_CONFIG_PATH", DEFAULT_CLIENT_CONFIG_PATH);
  if (!fs.existsSync(configPath)) {
    throw new ToolError(
      ErrorCodes.SERVER_ERROR,
      `Client config not found: ${configPath}`,
    );
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (
      !Array.isArray(config.remoteTools) ||
      config.localServers === null ||
      typeof config.localServers !== "object"
    ) {
      throw new Error("expected remoteTools array and localServers object");
    }
    return config;
  } catch (err) {
    throw new ToolError(
      ErrorCodes.SERVER_ERROR,
      `Invalid client config at ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

const TOOLS_SERVER_URL = normalizeMcpUrl(
  env("TOOLS_SERVER_URL", env("TOOL_SERVER_URL", DEFAULT_TOOLS_SERVER_URL)),
);
const clientConfig = loadClientConfig();
const agentId = env("CTO_AGENT_ID");
const agentPrewarm = env("CTO_AGENT_PREWARM");

function serverPrefix(toolName) {
  if (toolName.endsWith("_exa")) return "exa";
  const idx = toolName.indexOf("_");
  return idx > 0 ? toolName.slice(0, idx) : toolName;
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function matchesPattern(name, pattern) {
  if (pattern === name) return true;
  if (!pattern.includes("*")) return false;
  return wildcardToRegExp(pattern).test(name);
}

function configuredRemoteTools() {
  if (!Array.isArray(clientConfig.remoteTools)) return [];
  return clientConfig.remoteTools.filter((item) => typeof item === "string");
}

function isAlwaysAllowedTool(name) {
  return name.startsWith("tools_");
}

function isRemoteToolAllowed(name) {
  if (isAlwaysAllowedTool(name)) return true;
  const remoteTools = configuredRemoteTools();
  if (remoteTools.length === 0) return true;
  return remoteTools.some((pattern) => matchesPattern(name, pattern));
}

function assertRemoteToolAllowed(name) {
  if (isRemoteToolAllowed(name)) return;
  throw new ToolError(
    ErrorCodes.POLICY_DENIED,
    `Tool '${name}' is not allowed by /workspace/tools-config.json remoteTools`,
    { remoteTools: configuredRemoteTools() },
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpc(method, params) {
  const body = {
    jsonrpc: "2.0",
    id: ++rpcId,
    method,
    ...(params === undefined ? {} : { params }),
  };

  const headers = { "Content-Type": "application/json" };
  if (agentId) headers["X-Agent-Id"] = agentId;
  if (agentPrewarm) headers["X-Agent-Prewarm"] = agentPrewarm;

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const res = await fetch(TOOLS_SERVER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.status === 503 && attempt < RETRY_DELAYS_MS.length) {
        lastError = new Error("MCP server returned 503");
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      if (!res.ok) {
        throw new ToolError(
          ErrorCodes.SERVER_ERROR,
          `MCP server returned HTTP ${res.status}`,
          await res.text(),
        );
      }

      const json = await res.json();
      if (json.error) {
        throw new ToolError(json.error.code, json.error.message, json.error.data);
      }
      return json.result;
    } catch (err) {
      if (err instanceof ToolError) throw err;
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new ToolError(
        ErrorCodes.SERVER_ERROR,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  throw new ToolError(ErrorCodes.SERVER_ERROR, String(lastError));
}

function parseToolResult(result, name) {
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (result?.isError) {
    throw new ToolError(
      ErrorCodes.SERVER_ERROR,
      text ?? `Tool ${name} returned an MCP error result`,
      result,
    );
  }
  if (text === undefined) {
    throw new ToolError(
      ErrorCodes.SERVER_ERROR,
      `Tool ${name} returned no text content`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function listTools() {
  const result = await rpc("tools/list");
  const grouped = {};
  for (const tool of result?.tools ?? []) {
    if (!isRemoteToolAllowed(tool.name)) continue;
    const prefix = serverPrefix(tool.name);
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    });
  }
  return grouped;
}

export async function describeTool(name) {
  assertRemoteToolAllowed(name);
  const result = await rpc("tools/list");
  const tool = (result?.tools ?? []).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new ToolError(ErrorCodes.TOOL_NOT_FOUND, `Tool not found: ${name}`);
  }
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

export async function callTool(name, args = {}) {
  await describeTool(name);
  const result = await rpc("tools/call", { name, arguments: args });
  return parseToolResult(result, name);
}

export async function escalate(toolName, reason) {
  return callTool("tools_request_capability", {
    tool_name: toolName,
    reason,
  });
}

async function runCli() {
  const [, , command, toolName, rawArgs] = process.argv;
  if (!command || command === "help") {
    console.log("Usage:");
    console.log("  node /workspace/.cto-tools/mcp.mjs list");
    console.log("  node /workspace/.cto-tools/mcp.mjs describe <tool>");
    console.log("  node /workspace/.cto-tools/mcp.mjs call <tool> '{\"key\":\"value\"}'");
    return;
  }

  if (command === "list") {
    console.log(JSON.stringify(await listTools(), null, 2));
    return;
  }
  if (command === "describe" && toolName) {
    console.log(JSON.stringify(await describeTool(toolName), null, 2));
    return;
  }
  if (command === "call" && toolName) {
    const args = rawArgs ? JSON.parse(rawArgs) : {};
    console.log(JSON.stringify(await callTool(toolName, args), null, 2));
    return;
  }
  throw new Error(`Unsupported command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    if (err?.data) console.error(JSON.stringify(err.data));
    process.exit(1);
  });
}
