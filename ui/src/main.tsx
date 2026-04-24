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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
