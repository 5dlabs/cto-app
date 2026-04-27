import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauriRuntime } from "./runtime";
import "./styles/tokens.css";
import "./styles/scaffold.css";
import "./styles/shell.css";
import "./styles/views.css";
import "./styles/views-v2.css";
import "./styles/extras.css";
import "./styles/bootstrap.css";

function setupTauriMcp() {
  if (!import.meta.env.DEV) return;
  if (!isTauriRuntime()) return;

  void import("tauri-plugin-mcp")
    .then(({ setupPluginListeners }) => setupPluginListeners())
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
