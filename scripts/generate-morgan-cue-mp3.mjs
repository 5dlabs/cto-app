import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const [,, text, outPath, reason = 'setup-condition'] = process.argv;
if (!text || !outPath) {
  console.error('usage: node scripts/generate-morgan-cue-mp3.mjs <text> <out.mp3> [reason]');
  process.exit(2);
}

const url = process.env.VITE_VOICE_BRIDGE_WS || process.env.MORGAN_VOICE_WS || 'ws://localhost:8080/morgan/voice/ws';
const session = `morgan-cue-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const chunks = [];
let done = false;
let started = false;
let gotSpeechDone = false;
let gotBinary = false;

const finish = (code, message) => {
  if (done) return;
  done = true;
  clearTimeout(timeout);
  try { ws.close(); } catch {}
  if (code === 0) {
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) {
      console.error('voice-bridge returned no audio bytes');
      process.exit(1);
    }
    writeFileSync(outPath, buffer);
    console.log(JSON.stringify({ outPath, bytes: buffer.length, reason, url, gotSpeechDone, gotBinary }));
    process.exit(0);
  }
  console.error(message);
  process.exit(code);
};

const timeout = setTimeout(() => finish(1, 'Timed out waiting for voice-bridge speech audio'), Number(process.env.MORGAN_CUE_TIMEOUT_MS || 90000));
const ws = new WebSocket(url);
ws.binaryType = 'arraybuffer';

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'start', session_id: session }));
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    gotBinary = true;
    chunks.push(Buffer.from(data));
    return;
  }
  let frame;
  try { frame = JSON.parse(data.toString()); } catch { return; }
  if (frame.type === 'started' && !started) {
    started = true;
    ws.send(JSON.stringify({ type: 'speak', text, reason }));
    return;
  }
  if (frame.type === 'speech_done') {
    gotSpeechDone = true;
    try { ws.send(JSON.stringify({ type: 'stop' })); } catch {}
    setTimeout(() => finish(0), 250);
    return;
  }
  if (frame.type === 'error') {
    finish(1, `voice-bridge error: ${frame.error || 'unknown'}`);
  }
});

ws.on('error', (error) => finish(1, `voice-bridge websocket error: ${error.message}`));
ws.on('close', () => {
  if (!done && gotBinary) finish(0);
});
