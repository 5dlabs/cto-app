import net from 'node:net';

const socketPath = process.env.TAURI_MCP_SOCKET || '/tmp/tauri-mcp.sock';
const command = process.argv[2] || 'execute_js';
const payload = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const id = String(Date.now());
const request = JSON.stringify({ command, payload, id });

const socket = net.createConnection(socketPath);
socket.setTimeout(Number(process.env.TAURI_MCP_TIMEOUT_MS || 8000));
let data = '';
socket.on('connect', () => socket.write(request));
socket.on('data', (chunk) => { data += chunk.toString(); });
socket.on('timeout', () => { console.error('timeout'); socket.destroy(); process.exitCode = 124; });
socket.on('error', (err) => { console.error(err.stack || err.message); process.exitCode = 1; });
socket.on('close', () => {
  if (!data) return;
  try {
    const parsed = JSON.parse(data);
    const result = parsed.result?.result ?? parsed.result ?? parsed;
    if (typeof result === 'string') console.log(result);
    else console.log(JSON.stringify(result, null, 2));
  } catch {
    console.log(data);
  }
});
