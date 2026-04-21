import { useCallback, useEffect, useRef, useState } from "react";
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

type Mode = "video" | "voice" | "text";

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

export function MorganView() {
  const [mode, setMode] = useState<Mode>("video");
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const clientRef = useRef<VoiceClient | null>(null);

  const ensureClient = useCallback((): VoiceClient => {
    if (clientRef.current) return clientRef.current;
    const client = new VoiceClient({
      onStatus: setVoiceStatus,
      onTranscript: (t) => setTranscript(t),
      onReplyDelta: (t) => setReply((prev) => prev + t),
      onReplyText: (t) => setReply(t),
      onTurnDone: () => {
        // keep transcript/reply on screen; next turn will reset on start
      },
      onError: (err) => setVoiceError(err),
      onInputAnalyser: setInputAnalyser,
      onOutputAnalyser: setOutputAnalyser,
    });
    clientRef.current = client;
    return client;
  }, []);

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
    setVoiceConnected(false);
    setVoiceStatus("idle");
    setInputAnalyser(null);
    setOutputAnalyser(null);
  }, []);

  const startUtterance = useCallback(async () => {
    setTranscript("");
    setReply("");
    const client = ensureClient();
    if (!voiceConnected) {
      await client.connect();
      setVoiceConnected(true);
    }
    try {
      await client.startUtterance();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    }
  }, [ensureClient, voiceConnected]);

  const endUtterance = useCallback(async () => {
    try {
      await clientRef.current?.endUtterance(textDraft);
      setTextDraft("");
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    }
  }, [textDraft]);

  const sendTextTurn = useCallback(async () => {
    if (!textDraft.trim()) return;
    setTranscript(textDraft);
    setReply("");
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
    client.sendText(textDraft);
    setTextDraft("");
  }, [ensureClient, textDraft, voiceConnected]);

  // Auto-connect when entering voice mode; disconnect when leaving.
  useEffect(() => {
    if (mode === "voice") {
      void connectVoice();
    } else if (clientRef.current) {
      disconnectVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(
    () => () => {
      clientRef.current?.close();
      clientRef.current = null;
    },
    [],
  );

  const avatarState =
    voiceStatus === "streaming_user"
      ? "listening"
      : voiceStatus === "awaiting_reply"
      ? "thinking"
      : voiceStatus === "speaking"
      ? "speaking"
      : "idle";
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
              placeItems: "center",
              minHeight: 460,
            }}
          >
            {mode === "video" ? (
              <div style={{ width: "100%", height: "100%", minHeight: 440, display: "flex", justifyContent: "center" }}>
                <LemonSliceWidget agentId={PRODUCT_MORGAN_AGENT_ID} autoStartConversation={false} />
              </div>
            ) : mode === "voice" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  padding: "24px 0",
                }}
              >
                <MorganAvatar
                  src={MORGAN_PORTRAIT}
                  inputAnalyser={inputAnalyser}
                  outputAnalyser={outputAnalyser}
                  state={avatarState}
                  size={340}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, letterSpacing: 0.8 }}>
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
                {(transcript || reply || voiceError) && (
                  <div
                    style={{
                      width: "min(520px, 90%)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 12.5,
                      lineHeight: 1.55,
                    }}
                  >
                    {voiceError && (
                      <div style={{ color: "#f87171" }}>voice-bridge: {voiceError}</div>
                    )}
                    {transcript && (
                      <div style={{ opacity: 0.78 }}>
                        <strong style={{ opacity: 0.6 }}>You: </strong>
                        {transcript}
                      </div>
                    )}
                    {reply && (
                      <div>
                        <strong style={{ opacity: 0.6 }}>Morgan: </strong>
                        {reply}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="debate__tile debate__tile--moderator"
                style={{ maxWidth: 220, gridColumn: 1, gridRow: 1 }}
              >
                <div className="debate__speaking-ring" />
                <div className="debate__tile-initial">M</div>
                <div className="debate__tile-label">
                  <span>Morgan</span>
                  <span className="debate__tile-speaking">● {mode.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>
          <div className="debate__subs">
            <div className="debate__sub-line" style={{ ["--who-hue" as string]: 200 }}>
              <span className="debate__sub-who">Morgan:</span>
              <span>
                Standup ready. Conduit lease v2 merged last night, cto-pay release gated on flaky
                settle tests — Angie has a fix in staging.
              </span>
            </div>
            <div className="debate__sub-line" style={{ ["--who-hue" as string]: 200 }}>
              <span className="debate__sub-who">Morgan:</span>
              <span>Nothing blocking on your desk yet. Want me to queue sigma-1/rms for intake?</span>
            </div>
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
          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Today</div>
                <div className="section__title">Studio briefing</div>
              </div>
            </div>
            <div className="mem-list mem-list--logseq">
              <div className="mem-list-item">
                <span>conduit · lease v2 merged</span>
                <span className="count">09:04</span>
              </div>
              <div className="mem-list-item">
                <span>cto-pay · flaky settle test (Angie)</span>
                <span className="count">09:40</span>
              </div>
              <div className="mem-list-item">
                <span>openclaw · CLI routing spec review</span>
                <span className="count">10:15</span>
              </div>
              <div className="mem-list-item">
                <span>sigma-1 · rms intake ready</span>
                <span className="count">11:00</span>
              </div>
            </div>
          </div>
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
