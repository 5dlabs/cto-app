import { useEffect, useRef } from "react";

/**
 * LemonSlice agent IDs — two separate agents, never mix them up.
 *
 * PRODUCT (teams) Morgan — agent_3adc6522f21cc204
 *   Talks to operators / paying teams. Default for the CTO desktop app.
 *
 * INVESTOR Morgan — agent_0b8ca791bd37c632
 *   Used on /pitch CTA on the marketing site; not used inside the app.
 */
export const PRODUCT_MORGAN_AGENT_ID = "agent_3adc6522f21cc204";
export const INVESTOR_MORGAN_AGENT_ID = "agent_0b8ca791bd37c632";

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
  agentId?: string;
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
  agentId = PRODUCT_MORGAN_AGENT_ID,
  initialState = "active",
  inline = true,
  className,
  autoStartConversation = true,
}: LemonSliceWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureScript();
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const widgetKey = `${agentId}::${initialState}::${inline ? "inline" : "floating"}`;
    if (!sharedWidgetEl || sharedWidgetKey !== widgetKey) {
      const next = document.createElement(WIDGET_HOST_TAG) as LemonSliceWidgetElement;
      next.setAttribute("agent-id", agentId);
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
        if (typeof el.micOn !== "function") return;
        await el.micOn();
        conversationStarted = true;
      } catch {
        // retry via timers below
      }
    };

    const timers: number[] = [];
    if (typeof window !== "undefined" && window.customElements) {
      void window.customElements.whenDefined("lemon-slice-widget").then(() => {
        // Intentionally do not auto-call media actions here. Browsers reject
        // media playback before user interaction, causing noisy NotAllowedError
        // logs. We start only on first pointer interaction below.
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
  }, [agentId, initialState, inline, autoStartConversation]);

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
