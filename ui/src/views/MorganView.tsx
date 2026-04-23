import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconSend,
  IconVideo,
  IconMic,
  IconChat,
  IconSparkles,
  IconRefresh,
  IconExternal,
} from "./icons";
import { LemonSliceWidget, PRODUCT_MORGAN_AGENT_ID } from "../components/LemonSliceWidget";
import { MorganAvatar } from "../components/MorganAvatar";
import { VoiceClient, type VoiceStatus } from "../components/VoiceClient";
import { ProjectContextPanel } from "./ProjectContextPanel";
import { useProjects } from "../state/projectContext";

type Mode = "video" | "voice" | "text";

interface ChatMessage {
  id: string;
  role: "user" | "morgan" | "system";
  text: string;
  /** True while a Morgan reply is still streaming in. */
  pending?: boolean;
}

const MORGAN_PORTRAIT = "/uploads/morgan-hero.png";

function statusLabel(status: VoiceStatus, connected: boolean): string {
  if (!connected) return "DISCONNECTED";
  switch (status) {
    case "connecting":
      return "CONNECTING";
    case "listening":
      return "LISTENING";
    case "streaming_user":
      return "YOU · SPEAKING";
    case "awaiting_reply":
      return "MORGAN · THINKING";
    case "speaking":
      return "MORGAN · SPEAKING";
    case "error":
      return "ERROR";
    default:
      return "IDLE";
  }
}

function newId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function MorganView() {
  const [mode, setMode] = useState<Mode>("video");
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { activeProject } = useProjects();
  const clientRef = useRef<VoiceClient | null>(null);
  const pendingMorganIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether voice mode is active so post-turn callbacks can decide
  // whether to auto-re-arm listening without relying on stale closures.
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  // Guards against overlapping auto-start attempts during a turn's tail end.
  const startingUtteranceRef = useRef(false);

  const appendUser = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: newId(), role: "user", text: trimmed }]);
  }, []);

  const appendSystem = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: newId(), role: "system", text: trimmed }]);
  }, []);

  const startPendingMorgan = useCallback(() => {
    const id = newId();
    pendingMorganIdRef.current = id;
    setMessages((prev) => [...prev, { id, role: "morgan", text: "", pending: true }]);
    return id;
  }, []);

  const appendMorganDelta = useCallback((delta: string) => {
    if (!delta) return;
    let id = pendingMorganIdRef.current;
    if (!id) {
      id = newId();
      pendingMorganIdRef.current = id;
      setMessages((prev) => [...prev, { id: id!, role: "morgan", text: delta, pending: true }]);
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)),
    );
  }, []);

  const finalizeMorgan = useCallback((text: string) => {
    const id = pendingMorganIdRef.current;
    if (!id) {
      if (!text.trim()) return;
      setMessages((prev) => [...prev, { id: newId(), role: "morgan", text }]);
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text, pending: false } : m)),
    );
  }, []);

  const completeTurn = useCallback(() => {
    const id = pendingMorganIdRef.current;
    pendingMorganIdRef.current = null;
    if (!id) return;
    setMessages((prev) => {
      const hit = prev.find((m) => m.id === id);
      if (hit && !hit.text.trim()) return prev.filter((m) => m.id !== id);
      return prev.map((m) => (m.id === id ? { ...m, pending: false } : m));
    });
    // Note: we do NOT re-arm listening here. The dedicated "always-listening"
    // effect below watches voiceStatus and fires a fresh utterance when the
    // bridge returns to idle — that way we wait for TTS playback to actually
    // finish, instead of re-opening the mic while Morgan is still speaking
    // (which caused the "empty utterance" error from the bridge).
  }, []);

  const ensureClient = useCallback((): VoiceClient => {
    if (clientRef.current) return clientRef.current;
    const client = new VoiceClient({
      onStatus: setVoiceStatus,
      onTranscript: (t) => appendUser(t),
      onReplyDelta: (t) => appendMorganDelta(t),
      onReplyText: (t) => finalizeMorgan(t),
      onTurnDone: () => completeTurn(),
      onError: (err) => setVoiceError(err),
      onInputAnalyser: setInputAnalyser,
      onOutputAnalyser: setOutputAnalyser,
    });
    clientRef.current = client;
    return client;
  }, [appendUser, appendMorganDelta, finalizeMorgan, completeTurn]);

  const connectVoice = useCallback(async () => {
    setVoiceError(null);
    const client = ensureClient();
    try {
      await client.connect();
      setVoiceConnected(true);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    }
  }, [ensureClient]);

  const disconnectVoice = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    pendingMorganIdRef.current = null;
    setVoiceConnected(false);
    setVoiceStatus("idle");
    setInputAnalyser(null);
    setOutputAnalyser(null);
  }, []);

  const startUtterance = useCallback(async () => {
    if (startingUtteranceRef.current) return;
    startingUtteranceRef.current = true;
    try {
      const client = ensureClient();
      if (!voiceConnected) {
        await client.connect();
        setVoiceConnected(true);
      }
      // Pre-seed a pending Morgan bubble so deltas stream into the same turn.
      startPendingMorgan();
      await client.startUtterance();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    } finally {
      startingUtteranceRef.current = false;
    }
  }, [ensureClient, voiceConnected, startPendingMorgan]);

  const endUtterance = useCallback(async () => {
    try {
      await clientRef.current?.endUtterance(textDraft);
      setTextDraft("");
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    }
  }, [textDraft]);
  // Stable reference so VAD doesn't tear down on every textDraft keystroke.
  const endUtteranceRef = useRef(endUtterance);
  endUtteranceRef.current = endUtterance;

  const sendTextTurn = useCallback(async () => {
    const draft = textDraft.trim();
    if (!draft) return;
    const client = ensureClient();
    if (!voiceConnected) {
      try {
        await client.connect();
        setVoiceConnected(true);
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    appendUser(draft);
    startPendingMorgan();
    client.sendText(draft);
    setTextDraft("");
  }, [ensureClient, textDraft, voiceConnected, appendUser, startPendingMorgan]);

  // Brief Morgan when a project is created or switched. We:
  //  - add a visible "system" chip to the chat so the human sees the context
  //    change, and
  //  - (best-effort) send a framed text turn over the bridge so Morgan's LLM
  //    gets the project handoff in-band and can acknowledge / orient.
  const handleProjectCreated = useCallback(
    (name: string) => {
      appendSystem(
        `Project "${name}" created and set active. Morgan's cwd → /workspace/repos/${name}.`,
      );
      const client = clientRef.current;
      if (client) {
        startPendingMorgan();
        client.sendText(
          `[project-event] created_and_active project="${name}" path="/workspace/repos/${name}". ` +
            `Please briefly confirm you're in this project and remind me I can say "begin intake" once we've talked enough to draft a PRD.`,
        );
      }
    },
    [appendSystem, startPendingMorgan],
  );

  const handleProjectSwitched = useCallback(
    (name: string) => {
      appendSystem(`Active project → "${name}".`);
      const client = clientRef.current;
      if (client) {
        startPendingMorgan();
        client.sendText(
          `[project-event] switched_active project="${name}" path="/workspace/repos/${name}". ` +
            `Briefly acknowledge the switch and summarize what you know about this project so far.`,
        );
      }
    },
    [appendSystem, startPendingMorgan],
  );

  // Connect on entering voice; disconnect on leaving (any mode other than
  // voice) so the mic stops listening. Text sends will transparently reconnect
  // on demand via `ensureClient()` in `sendTextTurn`.
  useEffect(() => {
    if (mode === "voice") {
      void connectVoice();
    } else if (clientRef.current) {
      disconnectVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Always-listening loop: whenever we're in voice mode, connected, and the
  // bridge is idle (no utterance, no reply in flight, no TTS playing), kick
  // off a fresh utterance. Waiting for `idle` instead of firing straight off
  // `turn_done` ensures TTS playback has actually finished before the mic
  // re-opens — otherwise VAD can trip on its own output and the bridge sees
  // an empty utterance before any encoded audio reaches it.
  useEffect(() => {
    if (mode !== "voice") return;
    if (!voiceConnected) return;
    if (voiceStatus !== "idle" && voiceStatus !== "listening") return;
    if (startingUtteranceRef.current) return;
    // Small debounce lets the WebRTC graph settle before we re-open the mic.
    const t = window.setTimeout(() => {
      if (modeRef.current === "voice") void startUtterance();
    }, 120);
    return () => window.clearTimeout(t);
  }, [mode, voiceConnected, voiceStatus, startUtterance]);

  useEffect(
    () => () => {
      clientRef.current?.close();
      clientRef.current = null;
    },
    [],
  );

  // Auto-scroll chat to latest on new messages (text mode).
  useEffect(() => {
    if (mode !== "text") return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, mode]);

  // Voice activity detection — auto-end the utterance once the user has been
  // silent for ~1.2s after speaking. Runs only while the mic is actively
  // forwarding chunks (status === "streaming_user") so TTS bleed-through can't
  // trip it during Morgan's own reply.
  //
  // We adapt to each user's mic environment:
  //   1. Spend the first ~300ms sampling the *noise floor* (ambient RMS).
  //   2. Derive two thresholds with hysteresis off that floor:
  //        speech  = noiseFloor + SPEECH_MARGIN   (must also clear ABS_MIN)
  //        silence = noiseFloor + SILENCE_MARGIN  (lower; silence is below it)
  //   3. `speechStartedAt` only arms after we see a contiguous run of frames
  //      above the speech threshold, so a keyboard clack or a door bump
  //      doesn't register as "speech started" on its own.
  //   4. After speech is detected, any sustained stretch below the silence
  //      threshold for SILENCE_HANG_MS ends the turn.
  useEffect(() => {
    if (voiceStatus !== "streaming_user") return;
    if (!inputAnalyser) return;

    const buf = new Uint8Array(inputAnalyser.fftSize);

    // --- tunables ---------------------------------------------------------
    const CALIBRATE_MS = 300;      // window to measure ambient noise floor
    const SPEECH_MARGIN = 0.020;   // must be this far above noise floor to count as speech
    const SILENCE_MARGIN = 0.010;  // hysteresis band for silence
    const ABS_MIN_SPEECH = 0.028;  // floor under which we never treat audio as speech
    const SPEECH_ARM_MS = 120;     // need this many ms of contiguous speech to arm
    const MIN_SPEECH_MS = 300;     // total speech time before silence detection unlocks
    const SILENCE_HANG_MS = 1200;  // how long silence must persist to fire end
    const MIN_UTTERANCE_MS = 800;  // never auto-end earlier than this from utterance start
    const MAX_UTTERANCE_MS = 30_000;
    // ---------------------------------------------------------------------

    const start = performance.now();
    let calibrating = true;
    let noiseAcc = 0;
    let noiseCount = 0;
    let noiseFloor = 0.015; // sensible default if calibration is skipped

    let speechArmStartedAt = 0;  // frame-run counter for onset detection
    let speechStartedAt = 0;     // first moment we consider user to be speaking
    let lastVoiceAt = 0;
    let cancelled = false;
    let ended = false;
    let raf = 0;

    const autoEnd = () => {
      if (ended || cancelled) return;
      ended = true;
      void endUtteranceRef.current();
    };

    const tick = () => {
      if (cancelled) return;
      try {
        inputAnalyser.getByteTimeDomainData(buf);
      } catch {
        raf = requestAnimationFrame(tick);
        return;
      }
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      const elapsed = now - start;

      if (calibrating) {
        noiseAcc += rms;
        noiseCount += 1;
        if (elapsed >= CALIBRATE_MS) {
          noiseFloor = noiseCount > 0 ? noiseAcc / noiseCount : 0.015;
          calibrating = false;
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      const speechThresh = Math.max(ABS_MIN_SPEECH, noiseFloor + SPEECH_MARGIN);
      const silenceThresh = noiseFloor + SILENCE_MARGIN;

      if (rms > speechThresh) {
        if (!speechArmStartedAt) speechArmStartedAt = now;
        // Require SPEECH_ARM_MS of contiguous above-threshold frames before
        // committing to "user has spoken". This kills single-frame spikes.
        if (!speechStartedAt && now - speechArmStartedAt >= SPEECH_ARM_MS) {
          speechStartedAt = speechArmStartedAt;
        }
        lastVoiceAt = now;
      } else if (rms < silenceThresh) {
        // Reset the arm-counter on a clean silence frame so a half-bump
        // doesn't slowly accumulate into a false onset.
        speechArmStartedAt = 0;
        if (
          speechStartedAt &&
          now - start >= MIN_UTTERANCE_MS &&
          now - speechStartedAt >= MIN_SPEECH_MS &&
          now - lastVoiceAt >= SILENCE_HANG_MS
        ) {
          autoEnd();
          return;
        }
      }
      // In the hysteresis band (silenceThresh..speechThresh) we do nothing,
      // holding whatever state we're already in.

      if (speechStartedAt && now - start >= MAX_UTTERANCE_MS) {
        autoEnd();
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [voiceStatus, inputAnalyser]);

  const avatarState =
    voiceStatus === "streaming_user"
      ? "listening"
      : voiceStatus === "awaiting_reply"
      ? "thinking"
      : voiceStatus === "speaking"
      ? "speaking"
      : "idle";

  const morganTyping = useMemo(
    () => messages.some((m) => m.role === "morgan" && m.pending),
    [messages],
  );

  return (
    <div className="section">
      <div className="debate" style={{ minHeight: 520 }}>
        <div className="debate__stage">
          <div className="debate__grid" />
          <div className="debate__live">LIVE · {mode}</div>
          <div
            className="debate__committee"
            style={{
              gridTemplateColumns: "1fr",
              gridTemplateRows: "1fr",
              placeItems: "stretch",
              minHeight: 460,
              inset: mode === "text" ? "40px 20px 70px" : "40px 30px 70px",
            }}
          >
            {mode === "video" ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: 440,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <LemonSliceWidget agentId={PRODUCT_MORGAN_AGENT_ID} autoStartConversation={false} />
              </div>
            ) : mode === "voice" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 18,
                  padding: "24px 0",
                }}
              >
                <MorganAvatar
                  src={MORGAN_PORTRAIT}
                  inputAnalyser={inputAnalyser}
                  outputAnalyser={outputAnalyser}
                  state={avatarState}
                  size={360}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 11,
                    letterSpacing: 0.8,
                  }}
                >
                  <span style={{ opacity: 0.7 }}>Morgan</span>
                  <span className="debate__tile-speaking">● {statusLabel(voiceStatus, voiceConnected)}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {voiceStatus === "streaming_user" ? (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => void endUtterance()}
                    >
                      <IconMic size={12} /> Stop & send
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => void startUtterance()}
                      disabled={voiceStatus === "awaiting_reply" || voiceStatus === "speaking"}
                    >
                      <IconMic size={12} /> Hold to talk
                    </button>
                  )}
                  {voiceConnected ? (
                    <button type="button" className="debate__mode-btn" onClick={disconnectVoice}>
                      Disconnect
                    </button>
                  ) : (
                    <button type="button" className="debate__mode-btn" onClick={() => void connectVoice()}>
                      Connect
                    </button>
                  )}
                </div>
                {voiceError ? (
                  <div style={{ color: "#f87171", fontSize: 11.5 }}>voice-bridge: {voiceError}</div>
                ) : null}
              </div>
            ) : (
              <MorganChatPanel
                messages={messages}
                typing={morganTyping}
                portrait={MORGAN_PORTRAIT}
                endRef={chatEndRef}
                error={voiceError}
                activeProject={activeProject}
              />
            )}
          </div>
          <div className="debate__mode">
            <button
              type="button"
              className={`debate__mode-btn${mode === "video" ? " debate__mode-btn--active" : ""}`}
              onClick={() => setMode("video")}
            >
              <IconVideo size={13} /> Video
            </button>
            <button
              type="button"
              className={`debate__mode-btn${mode === "voice" ? " debate__mode-btn--active" : ""}`}
              onClick={() => setMode("voice")}
            >
              <IconMic size={13} /> Voice
            </button>
            <button
              type="button"
              className={`debate__mode-btn${mode === "text" ? " debate__mode-btn--active" : ""}`}
              onClick={() => setMode("text")}
            >
              <IconChat size={13} /> Text
            </button>
          </div>
        </div>

        <aside className="debate__aside">
          <ProjectContextPanel
            onProjectCreated={handleProjectCreated}
            onProjectSwitched={handleProjectSwitched}
          />
          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Last 24h</div>
                <div className="section__title">Operations</div>
              </div>
            </div>
            <div className="chart-row">
              <div>
                <div className="chart-label">Agent runs</div>
                <div className="chart-number">1,284</div>
                <div className="chart-delta">+12.4%</div>
              </div>
              <div>
                <div className="chart-label">Ships</div>
                <div className="chart-number">37</div>
                <div className="chart-delta">+4</div>
              </div>
              <div>
                <div className="chart-label">LLM spend</div>
                <div className="chart-number">$214</div>
                <div className="chart-delta chart-delta--down">−3.1%</div>
              </div>
            </div>
          </div>
          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Shortcuts</div>
                <div className="section__title">Say it, I'll route it</div>
              </div>
            </div>
            <div className="row row--wrap">
              <span className="chip">
                <IconRefresh size={11} /> Re-sync GitLab
              </span>
              <span className="chip">
                <IconSparkles size={11} /> Queue intake
              </span>
              <span className="chip">
                <IconExternal size={11} /> Open Grafana
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div className="chart-card">
        <div className="row" style={{ gap: 8 }}>
          <input
            className="field__input"
            placeholder={
              mode === "voice"
                ? "Type to merge with your voice turn — press Send to mix in"
                : "Message Morgan — she'll route to the right agent"
            }
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendTextTurn();
              }
            }}
          />
          <button type="button" className="primary-btn" onClick={() => void sendTextTurn()}>
            <IconSend size={12} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

interface MorganChatPanelProps {
  messages: ChatMessage[];
  typing: boolean;
  portrait: string;
  endRef: React.MutableRefObject<HTMLDivElement | null>;
  error: string | null;
  activeProject: string | null;
}

function MorganChatPanel({
  messages,
  typing,
  portrait,
  endRef,
  error,
  activeProject,
}: MorganChatPanelProps) {
  return (
    <div className="morgan-chat-panel">
      <div className="morgan-chat-panel__head">
        <img className="morgan-chat-panel__avatar" src={portrait} alt="Morgan" />
        <div className="morgan-chat-panel__head-text">
          <div className="morgan-chat-panel__name">Morgan</div>
          <div className="morgan-chat-panel__status">
            {typing ? "typing…" : "intake · on call"}
            {activeProject ? (
              <span className="morgan-chat-panel__project" title={`/workspace/repos/${activeProject}`}>
                · in <span className="mono">{activeProject}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="morgan-chat">
        {messages.length === 0 ? (
          <div className="morgan-chat__empty">
            <img className="morgan-chat__empty-avatar" src={portrait} alt="" />
            <div className="morgan-chat__empty-title">Say hi to Morgan</div>
            <div className="morgan-chat__empty-sub">
              Ask a question, route a task, or request a briefing. She'll hand off to the
              right agent from here.
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "system" ? (
              <div className="chat-row chat-row--system" key={m.id}>
                <div className="chat-bubble system">{m.text}</div>
              </div>
            ) : m.role === "morgan" ? (
              <div className="chat-row chat-row--morgan" key={m.id}>
                <img className="chat-row__avatar" src={portrait} alt="" aria-hidden />
                <div className={`chat-bubble morgan${m.pending && !m.text ? " is-typing" : ""}`}>
                  {m.text || (
                    <span className="chat-bubble__dots" aria-label="Morgan is typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="chat-row chat-row--user" key={m.id}>
                <div className="chat-bubble user">{m.text}</div>
              </div>
            ),
          )
        )}
        {error ? (
          <div className="chat-row chat-row--morgan">
            <div className="chat-bubble morgan" style={{ color: "#f87171" }}>
              voice-bridge: {error}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
