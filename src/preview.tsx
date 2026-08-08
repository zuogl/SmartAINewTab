import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { createPreviewRuntime } from "@/services/runtime";
import "@/styles/main.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App runtime={createPreviewRuntime()} />
  </React.StrictMode>,
);
