/**
 * Voice client for the in-cluster Morgan voice-bridge WebSocket.
 *
 * Wire-format (mirrors voice-bridge/app/main.py):
 *   client → bridge:
 *     { type: "start", session_id }       — open a turn
 *     <binary opus-webm chunk>            — mic audio frames
 *     { type: "text", text }              — keyboard addendum merged w/ speech
 *     { type: "end_utterance" }           — user stopped speaking
 *     { type: "stop" }                    — close session
 *   bridge → client:
 *     { type: "started", session_id }
 *     { type: "transcript", text }        — STT result
 *     { type: "reply_delta", text }       — streaming agent tokens
 *     { type: "reply_text", text }        — final assembled reply text
 *     <binary mp3 chunk>                  — TTS audio frames
 *     { type: "turn_done" }
 *     { type: "error", error }
 */

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "streaming_user"
  | "awaiting_reply"
  | "speaking"
  | "error";

export interface VoiceClientHandlers {
  onStatus?: (status: VoiceStatus) => void;
  onTranscript?: (text: string) => void;
  onReplyDelta?: (text: string) => void;
  onReplyText?: (text: string) => void;
  onTurnDone?: () => void;
  onError?: (err: string) => void;
  /** Emitted when the playback analyser is live so the avatar can bind. */
  onOutputAnalyser?: (analyser: AnalyserNode | null) => void;
  /** Emitted when the mic analyser is live. */
  onInputAnalyser?: (analyser: AnalyserNode | null) => void;
}

export interface VoiceClientOptions {
  /** ws://host:port/ws — defaults from VITE_VOICE_BRIDGE_WS or localhost:8090 */
  url?: string;
  /** Stable id passed to the bridge for session correlation. */
  sessionId?: string;
  /** Mime type fed to MediaRecorder — opus/webm works in Chrome/Edge/Firefox. */
  mimeType?: string;
}

const DEFAULT_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: { VITE_VOICE_BRIDGE_WS?: string } }).env
      ?.VITE_VOICE_BRIDGE_WS) ||
  "wss://morgan-voice.5dlabs.ai/ws";

function defaultMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "audio/webm";
}

export class VoiceClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private recorder: MediaRecorder | null = null;
  private mediaSource: MediaSource | null = null;
  private mp3Buffer: SourceBuffer | null = null;
  private pendingMp3: Uint8Array[] = [];
  private audioEl: HTMLAudioElement | null = null;
  private audioElSource: MediaElementAudioSourceNode | null = null;
  private status: VoiceStatus = "idle";
  private readonly url: string;
  private readonly sessionId: string;
  private readonly mimeType: string;
  private readonly handlers: VoiceClientHandlers;

  constructor(handlers: VoiceClientHandlers = {}, opts: VoiceClientOptions = {}) {
    this.handlers = handlers;
    this.url = opts.url ?? DEFAULT_URL;
    this.sessionId = opts.sessionId ?? cryptoRandomId();
    this.mimeType = opts.mimeType ?? defaultMime();
  }

  getStatus(): VoiceStatus {
    return this.status;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.setStatus("connecting");
    await this.ensureAudioContext();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "start", session_id: this.sessionId }));
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          this.handleJsonFrame(ev.data);
          // "started" confirms the session is live; resolve connect() on that.
          if (!settled) {
            try {
              const frame = JSON.parse(ev.data) as { type?: string };
              if (frame.type === "started") {
                settled = true;
                resolve();
              }
            } catch {
              /* ignore */
            }
          }
        } else {
          this.handleBinaryFrame(ev.data as ArrayBuffer);
        }
      };
      ws.onerror = () => {
        this.setStatus("error");
        this.handlers.onError?.("websocket error");
        if (!settled) {
          settled = true;
          reject(new Error("websocket error"));
        }
      };
      ws.onclose = () => {
        this.setStatus("idle");
        this.ws = null;
      };

      // Fallback: if server is slow to acknowledge, still resolve after 2s
      // so the UI can enable controls. (The turn will error cleanly if the
      // socket never actually opened.)
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 2000);
    });

    this.setStatus("listening");
  }

  async startUtterance(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("voice client not connected");
    }
    if (this.recorder && this.recorder.state === "recording") return;

    await this.ensureMic();
    const stream = this.micStream;
    if (!stream) throw new Error("mic unavailable");

    const recorder = new MediaRecorder(stream, { mimeType: this.mimeType });
    recorder.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size === 0) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        ev.data.arrayBuffer().then((buf) => {
          this.ws?.send(buf);
        });
      }
    };
    recorder.start(200); // emit 200ms chunks
    this.recorder = recorder;
    this.setStatus("streaming_user");
  }

  async endUtterance(textAddendum?: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.recorder && this.recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const r = this.recorder as MediaRecorder;
        r.onstop = () => resolve();
        r.stop();
      });
      this.recorder = null;
    }
    if (textAddendum && textAddendum.trim()) {
      this.ws.send(JSON.stringify({ type: "text", text: textAddendum.trim() }));
    }
    this.ws.send(JSON.stringify({ type: "end_utterance" }));
    this.setStatus("awaiting_reply");
  }

  /** Send text-only input (no mic). Bridge treats it as the whole turn. */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!text.trim()) return;
    this.ws.send(JSON.stringify({ type: "text", text: text.trim() }));
    this.ws.send(JSON.stringify({ type: "end_utterance" }));
    this.setStatus("awaiting_reply");
  }

  close(): void {
    try {
      this.ws?.send(JSON.stringify({ type: "stop" }));
    } catch {
      /* ignore */
    }
    this.ws?.close();
    this.ws = null;
    this.recorder?.stop();
    this.recorder = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micSource?.disconnect();
    this.micSource = null;
    this.inputAnalyser?.disconnect();
    this.inputAnalyser = null;
    this.handlers.onInputAnalyser?.(null);
    this.audioEl?.pause();
    if (this.audioEl) this.audioEl.src = "";
    this.audioEl = null;
    this.audioElSource?.disconnect();
    this.audioElSource = null;
    this.outputAnalyser?.disconnect();
    this.outputAnalyser = null;
    this.handlers.onOutputAnalyser?.(null);
    this.mp3Buffer = null;
    this.mediaSource = null;
    this.pendingMp3 = [];
    this.setStatus("idle");
  }

  // ---------- internals ----------

  private setStatus(s: VoiceStatus): void {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (this.audioCtx) return this.audioCtx;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.audioCtx = new Ctor();
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    return this.audioCtx;
  }

  private async ensureMic(): Promise<void> {
    if (this.micStream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this.micStream = stream;

    const ctx = await this.ensureAudioContext();
    this.micSource = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    this.micSource.connect(analyser);
    this.inputAnalyser = analyser;
    this.handlers.onInputAnalyser?.(analyser);
  }

  private handleJsonFrame(raw: string): void {
    let frame: { type?: string; text?: string; error?: string };
    try {
      frame = JSON.parse(raw) as typeof frame;
    } catch {
      return;
    }
    switch (frame.type) {
      case "started":
        break;
      case "transcript":
        if (frame.text) this.handlers.onTranscript?.(frame.text);
        break;
      case "reply_delta":
        if (frame.text) this.handlers.onReplyDelta?.(frame.text);
        break;
      case "reply_text":
        if (frame.text) this.handlers.onReplyText?.(frame.text);
        this.prepareMp3Sink();
        this.setStatus("speaking");
        break;
      case "turn_done":
        this.finalizeMp3Sink();
        this.handlers.onTurnDone?.();
        this.setStatus("listening");
        break;
      case "error":
        this.handlers.onError?.(frame.error ?? "unknown error");
        this.setStatus("error");
        break;
    }
  }

  private handleBinaryFrame(buf: ArrayBuffer): void {
    if (!this.mediaSource) this.prepareMp3Sink();
    const bytes = new Uint8Array(buf);
    this.pendingMp3.push(bytes);
    this.flushMp3Buffer();
  }

  private prepareMp3Sink(): void {
    if (this.mediaSource) return;
    if (typeof MediaSource === "undefined") return;
    if (!MediaSource.isTypeSupported("audio/mpeg")) return;

    const ms = new MediaSource();
    const audio = new Audio();
    audio.autoplay = true;
    audio.src = URL.createObjectURL(ms);
    this.audioEl = audio;
    this.mediaSource = ms;

    ms.addEventListener("sourceopen", () => {
      try {
        this.mp3Buffer = ms.addSourceBuffer("audio/mpeg");
        this.mp3Buffer.mode = "sequence";
        this.mp3Buffer.addEventListener("updateend", () => this.flushMp3Buffer());
        this.flushMp3Buffer();
      } catch (err) {
        this.handlers.onError?.(`mp3 sink: ${String(err)}`);
      }
    });

    // Wire playback analyser once the element has an audio context.
    void this.ensureAudioContext().then((ctx) => {
      if (!this.audioEl) return;
      this.audioElSource = ctx.createMediaElementSource(this.audioEl);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      this.audioElSource.connect(analyser);
      analyser.connect(ctx.destination);
      this.outputAnalyser = analyser;
      this.handlers.onOutputAnalyser?.(analyser);
    });

    void audio.play().catch(() => {
      // Autoplay might be blocked until a user gesture; user toggling voice
      // mode is the gesture so this should typically succeed.
    });
  }

  private flushMp3Buffer(): void {
    const sb = this.mp3Buffer;
    if (!sb || sb.updating) return;
    const next = this.pendingMp3.shift();
    if (!next) return;
    try {
      sb.appendBuffer(next as BufferSource);
    } catch (err) {
      this.handlers.onError?.(`append buffer: ${String(err)}`);
    }
  }

  private finalizeMp3Sink(): void {
    // Leave the stream open so consecutive turns can reuse it; we only
    // tear down in close(). Nothing to do here yet — the bridge sends
    // turn_done after the last mp3 chunk.
  }
}

function cryptoRandomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `sess-${Math.random().toString(36).slice(2, 10)}`;
}
