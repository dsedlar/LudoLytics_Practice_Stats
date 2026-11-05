import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import "./index.css";

// If a lazily-loaded chunk 404s because a new version was just deployed while
// this page was open, reload once to pick up the fresh build.
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("reloadedForChunk")) {
    sessionStorage.setItem("reloadedForChunk", "1");
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
