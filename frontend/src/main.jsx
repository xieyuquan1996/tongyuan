import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/tokens.css";
import "./styles/responsive.css";
import { installMock } from "./lib/mock.js";

// Install the in-browser mock backend unless VITE_USE_MOCK is explicitly "false".
// The mock intercepts `fetch("/api/*")` so the SPA is fully functional before
// the Go backend ships those endpoints. Flip the env flag to forward to the
// real backend (see vite.config.js proxy).
if (import.meta.env.VITE_USE_MOCK !== "false") {
  installMock();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
