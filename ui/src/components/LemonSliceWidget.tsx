import { useEffect, useRef } from "react";

/**
 * LemonSlice agent IDs — two separate agents, never mix them up.
 *
 * PRODUCT (teams) Morgan — agent_66794fa7a43ef7dd
 *   Current Operations-backed LemonSlice/LiveKit Morgan agent. Desktop does not
 *   use it as an implicit fallback because the account-side avatar can drift.
 *
 * INVESTOR Morgan — agent_0b8ca791bd37c632
 *   Used on /pitch CTA on the marketing site; not used inside the app.
 */
export const PRODUCT_MORGAN_AGENT_ID = "agent_66794fa7a43ef7dd";
export const INVESTOR_MORGAN_AGENT_ID = "agent_0b8ca791bd37c632";
export const CONFIGURED_PRODUCT_MORGAN_AGENT_ID =
  import.meta.env.VITE_LEMONSLICE_PRODUCT_MORGAN_AGENT_ID?.trim() || "";

const LEMON_SLICE_SCRIPT =
  "https://unpkg.com/@lemonsliceai/lemon-slice-widget@1.0.27/dist/index.js";
const LEMON_SLICE_SCRIPT_ID = "lemon-slice-widget-loader";
const WIDGET_HOST_TAG = "lemon-slice-widget";

interface LemonSliceWidgetElement extends HTMLElement {
  mute?: () => Promise<void>;
  unmute?: () => Promise<void>;
  canUnmute?: () => boolean;
  isMuted?: () => boolean;
  micOn?: () => Promise<void>;
}

interface LemonSliceWidgetProps {
  agentId: string;
  initialState?: "active" | "minimized";
  inline?: boolean;
  className?: string;
  autoStartConversation?: boolean;
}

let sharedWidgetEl: LemonSliceWidgetElement | null = null;
let sharedWidgetKey: string | null = null;

function ensureScript() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LEMON_SLICE_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = LEMON_SLICE_SCRIPT_ID;
  script.src = LEMON_SLICE_SCRIPT;
  script.type = "module";
  script.async = true;
  document.head.appendChild(script);
}

export function LemonSliceWidget({
  agentId,
  initialState = "active",
  inline = true,
  className,
  autoStartConversation = true,
}: LemonSliceWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedAgentId = agentId.trim();

  useEffect(() => {
    if (!normalizedAgentId) return;
    ensureScript();
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const widgetKey = `${normalizedAgentId}::${initialState}::${inline ? "inline" : "floating"}`;
    if (!sharedWidgetEl || sharedWidgetKey !== widgetKey) {
      const next = document.createElement(WIDGET_HOST_TAG) as LemonSliceWidgetElement;
      next.setAttribute("agent-id", normalizedAgentId);
      next.setAttribute("initial-state", initialState);
      if (initialState === "active") {
        next.setAttribute("controlled-widget-state", "active");
      }
      if (inline) next.setAttribute("inline", "true");
      next.style.display = "block";
      next.style.margin = "0 auto";
      sharedWidgetEl = next;
      sharedWidgetKey = widgetKey;
    }
    const el = sharedWidgetEl;
    if (!el) return;

    // Morgan is a 9:14 portrait; widget center-crops so always pass matching aspect.
    const AVATAR_ASPECT = 14 / 9;

    // Keep only one widget instance globally. In React StrictMode, effects
    // mount/unmount twice in dev — creating a second instance triggers
    // "Duplicate DailyIframe instances are not allowed" in the widget runtime.
    const previousHost = el.parentElement;
    if (previousHost && previousHost !== containerEl) previousHost.removeChild(el);
    containerEl.innerHTML = "";
    containerEl.appendChild(el);

    const applyActiveSizing = () => {
      const availableWidth = containerEl.clientWidth;
      const availableHeight = containerEl.clientHeight;
      if (availableWidth <= 0 || availableHeight <= 0) return;

      const minW = 240;
      const minH = Math.floor(minW * AVATAR_ASPECT);

      let activeW = Math.max(minW, Math.floor(Math.min(400, availableWidth)));
      let activeH = Math.floor(activeW * AVATAR_ASPECT);

      if (activeH > availableHeight) {
        activeH = Math.max(minH, availableHeight);
        activeW = Math.floor(activeH / AVATAR_ASPECT);
      }

      el.setAttribute("custom-active-width", String(activeW));
      el.setAttribute("custom-active-height", String(activeH));
    };

    applyActiveSizing();
    const resizeObserver = new ResizeObserver(() => applyActiveSizing());
    resizeObserver.observe(containerEl);

    let conversationStarted = false;
    const startConversation = async () => {
      if (!autoStartConversation || conversationStarted) return;
      try {
        if (typeof el.unmute === "function" && (!el.canUnmute || el.canUnmute())) {
          await el.unmute();
        }
        if (typeof el.micOn !== "function") return;
        await el.micOn();
        conversationStarted = true;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
          console.debug("LemonSlice auto-start deferred until user interaction.", error);
        }
      }
    };

    const timers: number[] = [];
    const scheduleStart = (delayMs: number) => {
      const timer = window.setTimeout(() => {
        void startConversation();
      }, delayMs);
      timers.push(timer);
    };

    if (typeof window !== "undefined" && window.customElements) {
      void window.customElements.whenDefined("lemon-slice-widget").then(() => {
        if (!autoStartConversation) return;
        [250, 1_000, 2_500].forEach(scheduleStart);
      });
    }

    const handleFirstInteraction = () => {
      void startConversation().finally(() => {
        containerEl.removeEventListener("pointerdown", handleFirstInteraction);
        document.removeEventListener("pointerdown", handleFirstInteraction, true);
      });
    };
    containerEl.addEventListener("pointerdown", handleFirstInteraction);
    document.addEventListener("pointerdown", handleFirstInteraction, true);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      resizeObserver.disconnect();
      containerEl.removeEventListener("pointerdown", handleFirstInteraction);
      document.removeEventListener("pointerdown", handleFirstInteraction, true);
      if (el.parentElement === containerEl) containerEl.removeChild(el);
    };
  }, [normalizedAgentId, initialState, inline, autoStartConversation]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lemon-slice-widget": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id"?: string;
          "initial-state"?: "active" | "minimized";
        },
        HTMLElement
      >;
    }
  }
}
