import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/*
 * This app deliberately registers NO service worker.
 * An inline script in index.html removes any worker/cache left by older
 * builds so a stale "connection settings" / previous-app screen can never
 * be served in front of the login page.
 */
