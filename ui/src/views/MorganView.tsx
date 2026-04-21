import { useState } from "react";
import {
  IconSend,
  IconVideo,
  IconMic,
  IconChat,
  IconSparkles,
  IconRefresh,
  IconExternal,
} from "./icons";

type Mode = "video" | "voice" | "text";

export function MorganView() {
  const [mode, setMode] = useState<Mode>("video");
  return (
    <div className="section">
      <div className="debate" style={{ minHeight: 420 }}>
        <div className="debate__stage">
          <div className="debate__grid" />
          <div className="debate__live">LIVE · {mode}</div>
          <div className="debate__committee" style={{ gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }}>
            <div
              className="debate__tile debate__tile--moderator"
              style={{ maxWidth: 220, gridColumn: 1, gridRow: 1 }}
            >
              <div className="debate__speaking-ring" />
              <div className="debate__tile-initial">M</div>
              <div className="debate__tile-label">
                <span>Morgan</span>
                <span className="debate__tile-speaking">● LIVE</span>
              </div>
            </div>
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
            placeholder="Message Morgan — she'll route to the right agent"
          />
          <button type="button" className="primary-btn">
            <IconSend size={12} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
