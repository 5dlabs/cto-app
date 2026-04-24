import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type BootstrapProgress = {
  stage: string;
  message: string;
  progress: number;
};

type BootstrapState = "checking" | "ready" | "failed";

export function LocalStackBootstrap({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootstrapState>("checking");
  const [progress, setProgress] = useState<BootstrapProgress>({
    stage: "runtime",
    message: "Installing dependencies...",
    progress: 4,
  });
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const runBootstrap = useCallback(async () => {
    setState("checking");
    setError(null);
    setProgress({
      stage: "runtime",
      message: "Installing dependencies...",
      progress: 4,
    });

    try {
      await invoke("bootstrap_local_stack");
      setProgress({
        stage: "ready",
        message: "Launching Codex App...",
        progress: 100,
      });
      setState("ready");
    } catch (err) {
      setError(String(err));
      setState("failed");
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<BootstrapProgress>("local-stack-progress", (event) => {
      setProgress(event.payload);
    })
      .then((handler) => {
        unlisten = handler;
      })
      .catch(() => undefined);

    if (!started.current) {
      started.current = true;
      void runBootstrap();
    }

    return () => {
      unlisten?.();
    };
  }, [runBootstrap]);

  if (state === "ready") {
    return <>{children}</>;
  }

  return (
    <div className="local-bootstrap" role="status" aria-live="polite">
      <div className="local-bootstrap__grid" />
      <div className="local-bootstrap__scan" />
      <div className="local-bootstrap__field" />

      <main className="local-bootstrap__content">
        <section className="local-bootstrap__machine" aria-hidden="true">
          <div className="local-bootstrap__ring local-bootstrap__ring--outer" />
          <div className="local-bootstrap__ring local-bootstrap__ring--mid" />
          <div className="local-bootstrap__ring local-bootstrap__ring--inner" />
          <div className="local-bootstrap__core">5D</div>
          <div className="local-bootstrap__bars">
            {Array.from({ length: 20 }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
            ))}
          </div>
        </section>

        <section className="local-bootstrap__copy">
          <div className="local-bootstrap__eyebrow">5D Labs local stack</div>
          <h1>Installing dependencies</h1>
          <p>
            {state === "failed"
              ? "Setup needs attention before the app can launch."
              : progress.message}
          </p>

          <div className="local-bootstrap__progress">
            <div className="local-bootstrap__progress-track">
              <span
                style={{ width: `${Math.max(4, Math.min(100, progress.progress))}%` }}
              />
            </div>
            <div className="local-bootstrap__progress-meta">
              <span>{progress.stage}</span>
              <span>{progress.progress}%</span>
            </div>
          </div>

          {state === "failed" ? (
            <div className="local-bootstrap__error">
              <pre>{error}</pre>
              <button type="button" onClick={() => void runBootstrap()}>
                Retry setup
              </button>
            </div>
          ) : (
            <div className="local-bootstrap__steps">
              <span>Runtime</span>
              <span>Kind</span>
              <span>GitOps</span>
              <span>Tools</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
