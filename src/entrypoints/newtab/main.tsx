import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { createChromeRuntime } from "@/services/runtime";
import "@/styles/main.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App runtime={createChromeRuntime()} />
  </React.StrictMode>,
);
