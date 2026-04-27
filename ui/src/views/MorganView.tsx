import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  IconSend,
  IconVideo,
  IconMic,
  IconChat,
  IconRefresh,
  IconPlus,
  IconExternal,
} from "./icons";
import {
  CONFIGURED_PRODUCT_MORGAN_AGENT_ID,
  LemonSliceWidget,
} from "../components/LemonSliceWidget";
import { MorganAvatar } from "../components/MorganAvatar";
import { VoiceClient, type VoiceStatus } from "../components/VoiceClient";
import { NewProjectModal } from "./NewProjectModal";
import { useProjects } from "../state/projectContext";
import { buildCoderUrl } from "./data";

type Mode = "video" | "voice" | "text";

const DEFAULT_MORGAN_AVATAR_EMBED_URL =
  "https://app.5dlabs.ai/morgan/avatar/embed";
const MORGAN_EMBED_MIN_HEIGHT = 520;
const MORGAN_EMBED_VIDEO_ASPECT = 0.66;
const RAW_MORGAN_AVATAR_EMBED_URL =
  import.meta.env.VITE_MORGAN_AVATAR_EMBED_URL?.trim();
const CONFIGURED_MORGAN_AVATAR_EMBED_URL =
  RAW_MORGAN_AVATAR_EMBED_URL === undefined
    ? DEFAULT_MORGAN_AVATAR_EMBED_URL
    : /^(local|none|off)$/i.test(RAW_MORGAN_AVATAR_EMBED_URL)
      ? ""
      : RAW_MORGAN_AVATAR_EMBED_URL;
const VOICE_READYZ_URL =
  import.meta.env.VITE_VOICE_BRIDGE_READYZ?.trim() ||
  "http://localhost:8080/morgan/voice/readyz";
const INTRO_CUE_SESSION_KEY = "morgan:intro-cue-played-at";
const INTRO_CUE_SUPPRESS_MS = 120_000;

const WORKING_CUES = [
  "I’m checking the workspace context and lining up the next step.",
  "I’m reading the project signals so the answer lands in the right place.",
  "I’m tracing the relevant files now; I’ll keep this moving.",
  "I’m comparing the current state with the expected behavior.",
  "I’m looking for the smallest safe change that fixes the root cause.",
  "I’m waiting on the model response, but I’m keeping the thread warm.",
  "I’m checking the GitOps and runtime context before I answer.",
  "I’m pulling together the implementation details now.",
  "I’m narrowing this down to the files that matter.",
  "I’m validating the path rather than guessing from the UI.",
  "I’m checking the local stack and keeping the conversation live.",
  "I’m looking for regressions tied to the last change.",
  "I’m working through the logs and runtime state now.",
  "I’m mapping the request to the active project context.",
  "I’m getting a concise answer ready while the backend finishes.",
  "I’m keeping an eye on the bridge and Morgan gateway.",
  "I’m separating UI delay from backend response time.",
  "I’m checking the current mode, project, and task context.",
  "I’m making sure the next response is grounded in the repo.",
  "I’m waiting on the inference path and staying with you.",
  "I’m reviewing the chart and app wiring for this change.",
  "I’m checking whether this is a frontend state issue or a bridge issue.",
  "I’m lining up the answer with the current Morgan workflow.",
  "I’m using the active context so I don’t give you a generic answer.",
];

function introCue(project: string | null): string {
  return project
    ? `Hey, I’m Morgan. I’m warming up ${project}, getting voice ready, and loading the live view now.`
    : "Hey, I’m Morgan. I’m warming up the workspace, getting voice ready, and loading the live view now.";
}

function workingCue(index: number, project: string | null, latestText: string | null): string {
  const base = WORKING_CUES[index % WORKING_CUES.length];
  if (project) return `${base} I’m in ${project}.`;
  const subject = latestText?.trim();
  if (subject) return `${base} I’m using what you just said as the task context.`;
  return base;
}

function reserveIntroCue(): boolean {
  try {
    const now = Date.now();
    const previous = Number(window.sessionStorage.getItem(INTRO_CUE_SESSION_KEY) ?? "0");
    if (previous && now - previous < INTRO_CUE_SUPPRESS_MS) return false;
    window.sessionStorage.setItem(INTRO_CUE_SESSION_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

interface ChatMessage {
  id: string;
  role: "user" | "morgan" | "system";
  text: string;
  /** True while a Morgan reply is still streaming in. */
  pending?: boolean;
}

function statusLabel(status: VoiceStatus, connected: boolean): string {
  if (!connected) return status === "error" ? "ERROR" : "WARMING UP";
  switch (status) {
    case "connecting":
      return "CONNECTING";
    case "listening":
      return "LISTENING";
    case "streaming_user":
      return "LISTENING";
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
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [voiceReply, setVoiceReply] = useState<string | null>(null);
  const [voiceCue, setVoiceCue] = useState<string | null>(null);
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarEmbedLayout, setAvatarEmbedLayout] = useState({
    scale: 1,
    width: 0,
    height: 0,
  });
  const {
    projects,
    activeProject,
    activeDescriptor,
    source,
    error: projectError,
    refresh,
    refreshing,
    setActive,
    verifyProject,
  } = useProjects();
  const clientRef = useRef<VoiceClient | null>(null);
  const pendingMorganIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textEchoToIgnoreRef = useRef<string | null>(null);
  // Guards against overlapping auto-start attempts during a turn's tail end.
  const startingUtteranceRef = useRef(false);
  const introPlayedRef = useRef(false);
  const cueInFlightRef = useRef(false);
  const workingCueIndexRef = useRef(0);
  const listenPausedUntilRef = useRef(0);

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
    setMessages((prev) => [
      ...prev.filter((m) => !(m.role === "morgan" && m.pending && !m.text.trim())),
      { id, role: "morgan", text: "", pending: true },
    ]);
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
      setMessages((prev) => {
        const lastMorgan = [...prev].reverse().find((m) => m.role === "morgan");
        if (lastMorgan?.text.trim() === text.trim()) return prev;
        return [...prev, { id: newId(), role: "morgan", text }];
      });
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
  }, []);

  const ensureClient = useCallback((): VoiceClient => {
    if (clientRef.current) return clientRef.current;
    const client = new VoiceClient({
      onStatus: (status) => {
        setVoiceStatus(status);
        if (status !== "error") setVoiceError(null);
      },
      onTranscript: (t) => {
        const transcript = t.trim();
        if (transcript) setVoiceTranscript(transcript);
        if (
          transcript &&
          textEchoToIgnoreRef.current &&
          transcript === textEchoToIgnoreRef.current
        ) {
          textEchoToIgnoreRef.current = null;
          return;
        }
        appendUser(t);
      },
      onReplyDelta: (t) => {
        appendMorganDelta(t);
        setVoiceReply((current) => `${current ?? ""}${t}`);
      },
      onReplyText: (t) => {
        setVoiceReply(t);
        finalizeMorgan(t);
      },
      onSpeechText: (text) => {
        listenPausedUntilRef.current = performance.now() + 10_000;
        setVoiceCue(text);
      },
      onSpeechDone: () => {
        listenPausedUntilRef.current = performance.now() + 7000;
        window.setTimeout(() => setVoiceCue(null), 1600);
      },
      onTurnDone: () => {
        listenPausedUntilRef.current = performance.now() + 5000;
        completeTurn();
      },
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

  const speakCue = useCallback(
    async (text: string, reason = "cue") => {
      const cue = text.trim();
      if (!cue || cueInFlightRef.current) return;
      cueInFlightRef.current = true;
      setVoiceCue(cue);
      try {
        await ensureClient().speakCue(cue, reason);
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : String(err));
      } finally {
        cueInFlightRef.current = false;
      }
    },
    [ensureClient],
  );

  const startUtterance = useCallback(async () => {
    if (startingUtteranceRef.current) return;
    startingUtteranceRef.current = true;
    try {
      const client = ensureClient();
      if (!voiceConnected) {
        await client.connect();
        setVoiceConnected(true);
      }
      setVoiceError(null);
      setVoiceTranscript(null);
      setVoiceReply(null);
      await client.startUtterance();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    } finally {
      startingUtteranceRef.current = false;
    }
  }, [ensureClient, voiceConnected]);

  const endUtterance = useCallback(async () => {
    try {
      startPendingMorgan();
      await clientRef.current?.endUtterance(textDraft);
      setTextDraft("");
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : String(err));
    }
  }, [startPendingMorgan, textDraft]);
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
    textEchoToIgnoreRef.current = draft;
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

  const switchActiveProject = useCallback(
    async (name: string | null) => {
      await setActive(name);
      if (name) handleProjectSwitched(name);
    },
    [handleProjectSwitched, setActive],
  );

  const openWorkspace = useCallback(async () => {
    if (!activeProject) return;
    setWorkspaceBusy(true);
    try {
      await verifyProject(activeProject);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendSystem(`Workspace verify failed for "${activeProject}": ${message}`);
    } finally {
      setWorkspaceBusy(false);
    }
    window.open(buildCoderUrl({ repo: activeProject }), "_blank", "noreferrer");
  }, [activeProject, appendSystem, verifyProject]);

  const refreshWebView = useCallback(() => {
    window.location.reload();
  }, []);
  const voicePresenceActive = mode === "video" || mode === "voice";

  // Warm the bridge immediately. This opens the socket and checks readiness,
  // but does not start microphone capture until the Voice tab is active.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await fetch(VOICE_READYZ_URL, { cache: "no-store" });
        } catch {
          /* bridge readiness is surfaced through the WebSocket path below */
        }
        if (cancelled) return;
        try {
          await ensureClient().connect();
          if (cancelled) return;
          setVoiceConnected(true);
          if (!introPlayedRef.current && reserveIntroCue()) {
            introPlayedRef.current = true;
            await speakCue(introCue(activeProject), "intro");
          }
        } catch (err) {
          if (!cancelled) setVoiceError(err instanceof Error ? err.message : String(err));
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeProject, ensureClient, speakCue]);

  useEffect(() => {
    if (voicePresenceActive) {
      if (!voiceConnected && voiceStatus !== "connecting") void connectVoice();
      return;
    }
    if (voiceStatus === "streaming_user") {
      void clientRef.current?.endUtterance();
    }
  }, [connectVoice, voiceConnected, voicePresenceActive, voiceStatus]);

  useEffect(() => {
    if (!voicePresenceActive) return;
    if (!voiceConnected || voiceStatus !== "listening") return;
    const waitMs = Math.max(180, listenPausedUntilRef.current - performance.now());
    const timer = window.setTimeout(() => void startUtterance(), waitMs);
    return () => window.clearTimeout(timer);
  }, [startUtterance, voiceConnected, voicePresenceActive, voiceStatus]);

  useEffect(() => {
    if (voiceStatus !== "awaiting_reply") return;
    let cancelled = false;
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled || voiceStatus !== "awaiting_reply") return;
        const cue = workingCue(
          workingCueIndexRef.current++,
          activeProject,
          voiceTranscript ?? textDraft,
        );
        void speakCue(cue, "working").finally(() => {
          if (!cancelled) schedule(11000);
        });
      }, delay);
    };
    schedule(5500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeProject, speakCue, textDraft, voiceStatus, voiceTranscript]);

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

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateScale = () => {
      const rect = stage.getBoundingClientRect();
      const width = stage.clientWidth || rect.width;
      const height = stage.clientHeight || rect.height;
      const availableHeight = Math.max(1, height);
      const scale = Math.min(1, availableHeight / MORGAN_EMBED_MIN_HEIGHT);
      const frameHeight = height / scale;
      const frameWidth = Math.min(width / scale, frameHeight * MORGAN_EMBED_VIDEO_ASPECT);
      const next = {
        scale: Number(scale.toFixed(4)),
        width: Math.round(frameWidth),
        height: Math.round(frameHeight),
      };
      setAvatarEmbedLayout((current) =>
        Math.abs(current.scale - next.scale) < 0.01 &&
        Math.abs(current.width - next.width) < 1 &&
        Math.abs(current.height - next.height) < 1
          ? current
          : next,
      );
    };

    updateScale();

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScale);
    observer?.observe(stage);
    window.addEventListener("resize", updateScale);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

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

  const stageStyle =
    mode === "video"
      ? ({
          "--morgan-embed-scale": avatarEmbedLayout.scale,
          "--morgan-frame-width": avatarEmbedLayout.width
            ? `${avatarEmbedLayout.width}px`
            : "100%",
          "--morgan-frame-height": avatarEmbedLayout.height
            ? `${avatarEmbedLayout.height}px`
            : "100%",
        } as CSSProperties)
      : undefined;

  return (
    <div className="morgan-surface">
      <div className="morgan-composer">
        <input
          className="field__input morgan-composer__input"
          placeholder="Message Morgan"
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
        <select
          className="morgan-project-select"
          value={activeProject ?? ""}
          onChange={(e) => void switchActiveProject(e.currentTarget.value || null)}
          title="Active project"
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.name} value={project.name}>
              {project.name}
            </option>
          ))}
        </select>
        {activeDescriptor ? (
          <div className="morgan-project-badges" title={activeDescriptor.path}>
            <span
              className={`morgan-project-chip ${
                activeDescriptor.hasPrd
                  ? activeDescriptor.state === "ready"
                    ? "morgan-project-chip--success"
                    : "morgan-project-chip--warn"
                  : "morgan-project-chip--muted"
              }`}
            >
              {activeDescriptor.hasPrd ? activeDescriptor.state : "no PRD"}
            </span>
            {activeDescriptor.hasArchitecture ? (
              <span className="morgan-project-chip morgan-project-chip--success">arch</span>
            ) : null}
            {activeDescriptor.status?.phase ? (
              <span className="morgan-project-chip">{activeDescriptor.status.phase}</span>
            ) : null}
          </div>
        ) : source === "stub" && projectError ? (
          <span className="morgan-project-chip morgan-project-chip--warn" title={projectError}>
            offline
          </span>
        ) : null}
        {activeProject ? (
          <button
            type="button"
            className="session-full__icon-btn"
            title="Open workspace"
            aria-label="Open workspace"
            disabled={workspaceBusy}
            onClick={() => void openWorkspace()}
          >
            <IconExternal size={12} />
          </button>
        ) : null}
        <button
          type="button"
          className="session-full__icon-btn"
          title="New project"
          aria-label="New project"
          onClick={() => setShowNewProject(true)}
        >
          <IconPlus size={12} />
        </button>
        <button
          type="button"
          className="session-full__icon-btn"
          title="Refresh projects"
          aria-label="Refresh projects"
          onClick={() => void refresh()}
        >
          <IconRefresh size={12} style={refreshing ? { opacity: 0.55 } : undefined} />
        </button>
        <button
          type="button"
          className="session-full__icon-btn"
          title="Refresh WebView"
          aria-label="Refresh WebView"
          onClick={refreshWebView}
        >
          <IconRefresh size={12} />
        </button>
      </div>

      <div className="morgan-mode-tabs" aria-label="Morgan mode">
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

      <div className="morgan-stage" data-mode={mode} ref={stageRef} style={stageStyle}>
        <div className="debate__grid" />
        {mode === "video" ? (
          <div className="morgan-video-frame">
            {CONFIGURED_MORGAN_AVATAR_EMBED_URL ? (
              <iframe
                className="morgan-livekit-frame"
                src={CONFIGURED_MORGAN_AVATAR_EMBED_URL}
                title="Morgan LemonSlice LiveKit avatar"
                allow="camera; microphone; autoplay; fullscreen; clipboard-read; clipboard-write"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="eager"
                onLoad={() => setAvatarLoaded(true)}
              />
            ) : CONFIGURED_PRODUCT_MORGAN_AGENT_ID ? (
              <LemonSliceWidget
                agentId={CONFIGURED_PRODUCT_MORGAN_AGENT_ID}
                autoStartConversation={false}
              />
            ) : (
              <div className="morgan-local-video">
                <MorganAvatar
                  inputAnalyser={inputAnalyser}
                  outputAnalyser={outputAnalyser}
                  state={avatarState}
                  size={420}
                />
                <span>Local Morgan</span>
              </div>
            )}
            {CONFIGURED_MORGAN_AVATAR_EMBED_URL && !avatarLoaded ? (
              <div className="morgan-video-preroll">
                <MorganAvatar
                  inputAnalyser={inputAnalyser}
                  outputAnalyser={outputAnalyser}
                  state={avatarState}
                  size={300}
                />
              </div>
            ) : null}
            <MorganPresence
              variant="video"
              status={voiceStatus}
              connected={voiceConnected}
              error={voiceError}
              transcript={voiceTranscript}
              reply={voiceReply}
              cue={voiceCue ?? (!avatarLoaded ? introCue(activeProject) : null)}
              inputAnalyser={inputAnalyser}
              outputAnalyser={outputAnalyser}
              avatarState={avatarState}
            />
          </div>
        ) : mode === "voice" ? (
          <MorganPresence
            variant="voice"
            status={voiceStatus}
            connected={voiceConnected}
            error={voiceError}
            transcript={voiceTranscript}
            reply={voiceReply}
            cue={voiceCue}
            inputAnalyser={inputAnalyser}
            outputAnalyser={outputAnalyser}
            avatarState={avatarState}
          />
        ) : (
          <MorganChatPanel
            messages={messages}
            typing={morganTyping}
            endRef={chatEndRef}
            error={voiceError}
            activeProject={activeProject}
          />
        )}
      </div>

      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={(project) => {
          handleProjectCreated(project.name);
          handleProjectSwitched(project.name);
        }}
      />
    </div>
  );
}

interface MorganPresenceProps {
  variant: "video" | "voice";
  status: VoiceStatus;
  connected: boolean;
  error: string | null;
  transcript: string | null;
  reply: string | null;
  cue: string | null;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  avatarState: "idle" | "listening" | "thinking" | "speaking";
}

function presenceHint(status: VoiceStatus, variant: "video" | "voice"): string {
  if (status === "streaming_user") return "Speak normally. Morgan will stop listening when you pause.";
  if (status === "awaiting_reply") return "Morgan heard you and is working.";
  if (status === "speaking") return "Morgan is speaking.";
  if (status === "connecting") return "Connecting Morgan voice.";
  return variant === "video"
    ? "Live video and hands-free voice share the same Morgan state."
    : "Hands-free voice starts automatically on this tab.";
}

function MorganPresence({
  variant,
  status,
  connected,
  error,
  transcript,
  reply,
  cue,
  inputAnalyser,
  outputAnalyser,
  avatarState,
}: MorganPresenceProps) {
  const hasExchange = Boolean(transcript || reply || cue);
  return (
    <div className={`morgan-presence morgan-presence--${variant}`}>
      {variant === "voice" ? (
        <MorganAvatar
          inputAnalyser={inputAnalyser}
          outputAnalyser={outputAnalyser}
          state={avatarState}
          size={360}
        />
      ) : null}
      <div className="morgan-presence__panel">
        <div className="morgan-presence__status">
          <span>Morgan</span>
          <span className="debate__tile-speaking">● {statusLabel(status, connected)}</span>
        </div>
        <div className="morgan-presence__hint">{presenceHint(status, variant)}</div>
        {error ? <div className="morgan-presence__error">voice-bridge: {error}</div> : null}
        {hasExchange ? (
          <div className="morgan-presence__exchange">
            {transcript ? (
              <div>
                <span>You</span>
                <p>{transcript}</p>
              </div>
            ) : null}
            {reply ? (
              <div>
                <span>Morgan</span>
                <p>{reply}</p>
              </div>
            ) : null}
            {cue ? (
              <div>
                <span>Morgan cue</span>
                <p>{cue}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface MorganChatPanelProps {
  messages: ChatMessage[];
  typing: boolean;
  endRef: React.MutableRefObject<HTMLDivElement | null>;
  error: string | null;
  activeProject: string | null;
}

function MorganChatPanel({
  messages,
  typing,
  endRef,
  error,
  activeProject,
}: MorganChatPanelProps) {
  return (
    <div className="morgan-chat-panel">
      <div className="morgan-chat">
        {messages.length === 0 ? (
          <div className="morgan-chat__empty">
            <div className="morgan-chat__empty-avatar morgan-mark" aria-hidden>
              M
            </div>
            <div className="morgan-chat__empty-title">
              {activeProject ? `In ${activeProject}` : "No messages yet"}
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
                <div className="chat-row__avatar morgan-mark" aria-hidden>
                  M
                </div>
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
        {typing ? null : null}
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
