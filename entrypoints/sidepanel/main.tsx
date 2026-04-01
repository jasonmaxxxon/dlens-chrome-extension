import React from "react";
import ReactDOM from "react-dom/client";
import { SidepanelApp } from "../../src/ui/SidepanelApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Sidepanel root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SidepanelApp />
  </React.StrictMode>
);
