import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/scaffold.css";
import "./styles/shell.css";
import "./styles/views.css";
import "./styles/views-v2.css";
import "./styles/extras.css";
import "./styles/bootstrap.css";

function setupTauriMcp() {
  const isTauriDebugBuild = import.meta.env.TAURI_ENV_DEBUG === "true";
  if (!import.meta.env.DEV && !isTauriDebugBuild) return;

  void import("tauri-plugin-mcp")
    .then(({ setupPluginListeners }) => setupPluginListeners())
    .then(() => {
      if (typeof window !== "undefined") {
        (window as typeof window & { __ctoTauriMcpReady?: boolean }).__ctoTauriMcpReady = true;
      }
    })
    .catch((error) => {
      console.debug("Tauri MCP listener setup failed.", error);
    });
}

setupTauriMcp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
